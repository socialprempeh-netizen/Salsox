import {
  Infinity as InfinityIcon,
  MailCheck,
  Smartphone,
  Zap,
  Lock,
  CreditCard,
  Database,
  Moon,
  ShieldCheck,
  Crown,
  Rocket,
  FileCode,
  Mail,
  type LucideIcon,
} from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Reveal } from "@/components/landing/reveal"
import { TechStack } from "@/components/landing/tech-stack"
import { useTranslations } from "next-intl"
import { isKitSite } from "@/config/kit"
import { FREE_DOCUMENTS_PER_MONTH } from "@/lib/esign/plans"

type Feature = { icon: LucideIcon; key: string }

/**
 * Placeholder feature grid, written from your customer's point of view.
 * Every card here describes something the kit actually does, so the copy is
 * honest before you touch it: rewrite each one in terms of your product.
 *
 * Six of them, two full rows: enough to show the pattern without pretending
 * to be your feature list. Add a third row if your product needs one.
 */
// Were the kit's placeholder icons (a lock for unlimited sending, a moon for
// phone signing): each card now carries an icon for what it says.
// const productFeatures: Feature[] = [
//   { icon: Lock, key: "c1" }, { icon: CreditCard, key: "c2" }, { icon: Database, key: "c3" },
//   { icon: Moon, key: "c4" }, { icon: ShieldCheck, key: "c5" }, { icon: Crown, key: "c6" },
// ]
const productFeatures: Feature[] = [
  { icon: InfinityIcon, key: "c1" },
  { icon: MailCheck, key: "c2" },
  { icon: Smartphone, key: "c3" },
  { icon: CreditCard, key: "c4" },
  { icon: Zap, key: "c5" },
  { icon: ShieldCheck, key: "c6" },
]

/** The kit's own site (KIT_SITE="true"): what a developer gets by cloning. */
const kitFeatures: Feature[] = [
  { icon: Lock, key: "c1" },
  { icon: CreditCard, key: "c2" },
  { icon: Database, key: "c3" },
  { icon: Moon, key: "c4" },
  { icon: ShieldCheck, key: "c5" },
  { icon: Crown, key: "c6" },
  { icon: Rocket, key: "c7" },
  { icon: FileCode, key: "c8" },
  { icon: Mail, key: "c9" },
]

const features = isKitSite ? kitFeatures : productFeatures


/**
 * Homepage redesign: the grid sits on a full-width band of the brand accent
 * (src/config/brand.ts), white square cards on it, the icon in the primary
 * colour and the heading in the display serif. Was a plain section of
 * bordered cards on the page background, with the classes noted below.
 */
export function Features() {
  const t = useTranslations("features")
  return (
    <section id="features" className="bg-brand-accent py-20 text-white sm:py-24">
      <div className="mx-auto max-w-6xl px-6 lg:px-12">
        <Reveal className={isKitSite ? "mb-10 text-center" : "mb-14 text-center"}>
          {/* Was: text-3xl font-bold … text-foreground, and a muted subtitle. */}
          <h2 className="font-display text-3xl font-semibold tracking-tight sm:text-[2.75rem]">
            {t("title")}
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-white/80">{t("subtitle")}</p>
        </Reveal>

        {/* The "built with" logo strip belongs to the kit's own site, where the
            stack is the product. In your app it would advertise our
            dependencies instead of what you do, so it stays off. */}
        {isKitSite && <TechStack className="mb-14" />}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 lg:gap-5">
          {features.map((feature, i) => {
            const Icon = feature.icon
            return (
              <Reveal key={feature.key} delay={(i % 3) * 80}>
                {/* Was: Card with hover:border-primary/30 and a gradient icon tile. */}
                <Card className="group h-full border-white/10 bg-white text-neutral-900 transition-transform duration-300 hover:-translate-y-1 motion-reduce:transition-none motion-reduce:hover:translate-y-0">
                  <CardHeader>
                    <div className="mb-3 inline-flex h-12 w-12 items-center justify-center bg-primary/10 text-primary transition-transform duration-300 group-hover:scale-110 motion-reduce:group-hover:scale-100">
                      <Icon className="h-6 w-6" strokeWidth={1.75} />
                    </div>
                    <CardTitle className="text-base">{t(`${feature.key}.title`)}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <CardDescription className="text-sm leading-relaxed text-neutral-600">
                      {t(`${feature.key}.description`, { free: FREE_DOCUMENTS_PER_MONTH })}
                    </CardDescription>
                  </CardContent>
                </Card>
              </Reveal>
            )
          })}
        </div>
      </div>
    </section>
  )
}
