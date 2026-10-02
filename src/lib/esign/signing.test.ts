/**
 * Tests for submitting a signature (`saveField`).
 *
 * The case that matters: a signer submits something that is not a usable
 * image. It must be refused at that moment, with the code the signing page
 * turns into "draw it again", and nothing may be written. Before this, the
 * bad image was stored and only failed when the finished document was sealed,
 * which it then could never be.
 *
 * The database is mocked: these tests are about what `saveField` decides and
 * whether it writes, not about Prisma. The modules that reach for email,
 * storage and payment providers are stubbed so the file under test loads
 * alone.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"

const TOKEN = "a".repeat(32)
const transaction = vi.fn()
const recordAudit = vi.fn()
const loadRecipient = vi.fn()
const createPayment = vi.fn()
const findPayout = vi.fn()
const getProvider = vi.fn()
const findPayment = vi.fn()
const findStartedEvent = vi.fn()
const updatePayments = vi.fn()

const recipient = {
  id: "rec_1",
  documentId: "doc_1",
  email: "ama@example.com",
  name: "Ama",
  role: "SIGNER",
  order: 0,
  signingStatus: "NOT_SIGNED",
  expiresAt: null,
  payments: [],
}
const document = { id: "doc_1", status: "PENDING", signingOrder: "PARALLEL", recipients: [recipient] }

vi.mock("@/lib/prisma", () => ({
  prisma: {
    recipient: { findUnique: (...a: unknown[]) => loadRecipient(...a) },
    payment: {
      create: (...a: unknown[]) => createPayment(...a),
      findUnique: (...a: unknown[]) => findPayment(...a),
      count: async () => 0,
      update: vi.fn(),
      updateMany: (...a: unknown[]) => updatePayments(...a),
    },
    auditEvent: { findFirst: (...a: unknown[]) => findStartedEvent(...a) },
    payoutAccount: { findUnique: (...a: unknown[]) => findPayout(...a) },
    field: { findFirst: async () => ({ id: "field_1", recipientId: "rec_1", type: "SIGNATURE" }) },
    $transaction: transaction,
  },
}))
vi.mock("./audit", () => ({
  AUDIT: { FIELD_SIGNED: "FIELD_SIGNED", PAYMENT_STARTED: "PAYMENT_STARTED", PAYMENT_FAILED: "PAYMENT_FAILED" },
  recordAudit,
  requestMeta: async () => ({ ipAddress: null, userAgent: null }),
}))
vi.mock("./documents", () => ({ finalizeDocument: vi.fn(), appUrl: () => "http://localhost:3000" }))
vi.mock("./emails", () => ({ delivered: () => true, emailed: () => true, sendDocumentRejected: vi.fn(), sendSigningInvite: vi.fn() }))
vi.mock("./payments", () => ({ getProvider: (...a: unknown[]) => getProvider(...a) }))

const { saveField, startPayment } = await import("./signing")

// 1x1 transparent PNG.
const VALID_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="
const base64 = (text: string) => Buffer.from(text).toString("base64")

beforeEach(() => {
  vi.clearAllMocks()
  loadRecipient.mockImplementation(async () => ({ ...recipient, document }))
  transaction.mockImplementation(async (run: (tx: unknown) => Promise<void>) =>
    run({ signature: { upsert: vi.fn() }, field: { update: vi.fn() } })
  )
})

describe("saveField with a drawn signature", () => {
  it("refuses bytes that are not an image, and stores nothing", async () => {
    const corrupt = `data:image/png;base64,${base64("definitely not a PNG, just text")}`
    expect(await saveField(TOKEN, "field_1", { imageDataUrl: corrupt })).toEqual({ ok: false, error: "invalidSignature" })
    expect(transaction).not.toHaveBeenCalled()
    expect(recordAudit).not.toHaveBeenCalled()
  })

  it("refuses a truncated PNG, and stores nothing", async () => {
    const truncated = VALID_PNG.slice(0, VALID_PNG.length - 40)
    expect(await saveField(TOKEN, "field_1", { imageDataUrl: truncated })).toEqual({ ok: false, error: "invalidSignature" })
    expect(transaction).not.toHaveBeenCalled()
  })

  it("refuses a JPEG declared as a PNG, and stores nothing", async () => {
    const mislabelled = `data:image/png;base64,${Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 74, 70, 73, 70]).toString("base64")}`
    expect(await saveField(TOKEN, "field_1", { imageDataUrl: mislabelled })).toEqual({ ok: false, error: "invalidSignature" })
    expect(transaction).not.toHaveBeenCalled()
  })

  it("stores a valid image", async () => {
    expect(await saveField(TOKEN, "field_1", { imageDataUrl: VALID_PNG })).toEqual({ ok: true })
    expect(transaction).toHaveBeenCalledTimes(1)
    expect(recordAudit).toHaveBeenCalledTimes(1)
  })

  it("still accepts a typed signature, which has no image to check", async () => {
    expect(await saveField(TOKEN, "field_1", { typedText: "Ama Mensah" })).toEqual({ ok: true })
    expect(transaction).toHaveBeenCalledTimes(1)
  })
})

/**
 * Sign & Pay amounts are stored in hundredths, which is only true of the
 * offered currencies. A document saved before the server restricted them may
 * still carry a crafted zero-decimal code; starting its checkout would charge
 * a hundred times the amount shown, so it must not start at all.
 */
describe("startPayment with a currency outside the offered list", () => {
  const owing = (paymentCurrency: string) => ({
    ...recipient,
    mustPay: true,
    document: { ...document, userId: "user_1", title: "Invoice", paymentAmount: 1250, paymentProvider: "STRIPE", paymentCurrency },
  })

  it("refuses a zero-decimal currency before creating any payment or checkout", async () => {
    loadRecipient.mockResolvedValue(owing("JPY"))
    expect(await startPayment(TOKEN)).toEqual({ ok: false, error: "payoutUnavailable" })
    expect(createPayment).not.toHaveBeenCalled()
    expect(getProvider).not.toHaveBeenCalled()
  })

  it("lets an offered currency through to the provider", async () => {
    loadRecipient.mockResolvedValue(owing("USD"))
    findPayout.mockResolvedValue({ ready: true, externalAccountId: "acct_1" })
    const createCheckout = vi.fn(async (req: { reference: string }) => ({ url: "https://pay.example/1", providerRef: req.reference }))
    getProvider.mockReturnValue({ isConfigured: () => true, createCheckout })
    createPayment.mockResolvedValue({ id: "pay_1" })
    transaction.mockImplementation(async (run: (tx: unknown) => Promise<unknown>) =>
      run({ $executeRaw: vi.fn(), payment: { findFirst: async () => null, create: createPayment } })
    )
    expect(await startPayment(TOKEN)).toEqual({ ok: true, url: "https://pay.example/1" })
    expect(createCheckout).toHaveBeenCalledWith(expect.objectContaining({ amount: 1250, currency: "USD" }))
  })
})

/**
 * One checkout per document. A reload, a back button or a double tap used to
 * open a second live payment page; the second could be paid too.
 */
describe("startPayment with a checkout already open", () => {
  const owing = {
    ...recipient,
    mustPay: true,
    document: { ...document, userId: "user_1", title: "Invoice", paymentAmount: 1250, paymentProvider: "STRIPE", paymentCurrency: "USD" },
  }
  const open = (ageMs: number) => ({
    id: "pay_open",
    documentId: "doc_1",
    recipientId: "rec_1",
    provider: "STRIPE",
    providerRef: "cs_open",
    amount: 1250,
    currency: "USD",
    status: "PENDING",
    createdAt: new Date(Date.now() - ageMs),
    recipient: owing,
    document: { status: "PENDING" },
  })
  const createCheckout = vi.fn(async () => ({ url: "https://pay.example/new", providerRef: "cs_new" }))

  beforeEach(() => {
    loadRecipient.mockResolvedValue(owing)
    findPayout.mockResolvedValue({ ready: true, externalAccountId: "acct_1" })
    createCheckout.mockClear()
  })

  const withOpen = (ageMs: number, url: string | null) => {
    findPayment.mockResolvedValue(open(ageMs))
    findStartedEvent.mockResolvedValue(url ? { data: { url } } : null)
    transaction.mockImplementation(async (run: (tx: unknown) => Promise<unknown>) =>
      run({ $executeRaw: vi.fn(), payment: { findFirst: async () => open(ageMs), create: createPayment } })
    )
    getProvider.mockReturnValue({
      isConfigured: () => true,
      createCheckout,
      verify: async () => ({ status: "PENDING", amount: 1250, currency: "USD" }),
    })
  }

  it("sends the signer back to the checkout already open", async () => {
    withOpen(30_000, "https://pay.example/open")
    expect(await startPayment(TOKEN)).toEqual({ ok: true, url: "https://pay.example/open" })
    expect(createCheckout).not.toHaveBeenCalled()
    expect(createPayment).not.toHaveBeenCalled()
  })

  it("asks to wait while another request is still opening it", async () => {
    withOpen(1_000, null)
    expect(await startPayment(TOKEN)).toEqual({ ok: false, error: "paymentInProgress" })
    expect(createCheckout).not.toHaveBeenCalled()
  })

  it("closes the claim when the provider refuses to open a checkout", async () => {
    transaction.mockImplementation(async (run: (tx: unknown) => Promise<unknown>) =>
      run({ $executeRaw: vi.fn(), payment: { findFirst: async () => null, create: createPayment } })
    )
    createPayment.mockResolvedValue({ id: "pay_new", documentId: "doc_1", recipientId: "rec_1", provider: "STRIPE" })
    updatePayments.mockResolvedValue({ count: 1 })
    getProvider.mockReturnValue({ isConfigured: () => true, createCheckout: async () => { throw new Error("provider down") } })
    vi.spyOn(console, "error").mockImplementation(() => {})
    expect(await startPayment(TOKEN)).toEqual({ ok: false, error: "paymentFailed" })
    expect(updatePayments).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "pay_new", status: "PENDING" }, data: { status: "FAILED" } }))
  })
})
