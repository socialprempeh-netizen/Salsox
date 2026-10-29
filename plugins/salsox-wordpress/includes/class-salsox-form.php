<?php
/**
 * The "Request a signature" form: what a visitor sees, and what happens when
 * they send it. The [salsox_sign] shortcode and the Salsox block both render
 * through render(), so they look and behave the same.
 *
 * Which document is sent is decided by the site owner, never by the visitor.
 * The form's settings (the template or PDF, the title, the message) travel
 * with the form as a token signed with this site's salts; a submission whose
 * token does not verify is refused, so a visitor cannot change the document,
 * the title or the message by editing the page.
 *
 * Every request sends a real document from the owner's Salsox account and
 * counts against its plan, so a submission must pass, in order: the nonce, a
 * honeypot field, the "logged-in visitors only" setting, a per-visitor and
 * per-email hourly limit and a daily limit for the whole site. Salsox applies
 * its own limits after that.
 *
 * @package Salsox
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Renders the form and handles its submissions.
 */
class Salsox_Form {

	/** Nonce action of the form. */
	const NONCE = 'salsox_request';

	/** Option the request log is stored in (not autoloaded). */
	const LOG_OPTION = 'salsox_log';

	/** Entries the request log keeps. */
	const LOG_SIZE = 50;

	/** Largest PDF Salsox accepts, in bytes (4 MB). */
	const MAX_PDF_BYTES = 4194304;

	/**
	 * Hooks the shortcode, the block, the assets and the no-JavaScript fallback.
	 */
	public static function init() {
		add_action( 'init', array( __CLASS__, 'register' ) );
		add_action( 'admin_post_salsox_request', array( __CLASS__, 'handle_post' ) );
		add_action( 'admin_post_nopriv_salsox_request', array( __CLASS__, 'handle_post' ) );
	}

	/**
	 * Registers the front-end assets, the shortcode and the block.
	 */
	public static function register() {
		wp_register_style( 'salsox-form', SALSOX_URL . 'assets/css/salsox-form.css', array(), SALSOX_VERSION );
		wp_register_script( 'salsox-form', SALSOX_URL . 'assets/js/salsox-form.js', array(), SALSOX_VERSION, array( 'in_footer' => true, 'strategy' => 'defer' ) );
		wp_localize_script(
			'salsox-form',
			'salsoxForm',
			array(
				'endpoint'     => esc_url_raw( rest_url( 'salsox/v1/request' ) ),
				'sending'      => __( 'Sending…', 'salsox' ),
				'failed'       => __( 'Your request could not be sent. Check your connection and try again.', 'salsox' ),
				'needName'     => __( 'Enter your full name.', 'salsox' ),
				'needEmail'    => __( 'Enter a valid email address.', 'salsox' ),
				/* translators: %s: the document's title. */
				'doneTitled'   => __( '“%s” is on its way to', 'salsox' ),
				'doneUntitled' => __( 'The document is on its way to', 'salsox' ),
				'doneAfter'    => __( 'Open the email from Salsox to read and sign it.', 'salsox' ),
			)
		);

		add_shortcode( 'salsox_sign', array( __CLASS__, 'shortcode' ) );

		wp_register_script(
			'salsox-block-editor',
			SALSOX_URL . 'blocks/request-signature/index.js',
			array( 'wp-blocks', 'wp-element', 'wp-block-editor', 'wp-components', 'wp-i18n', 'wp-api-fetch', 'wp-server-side-render' ),
			SALSOX_VERSION,
			true
		);
		wp_set_script_translations( 'salsox-block-editor', 'salsox' );
		register_block_type(
			SALSOX_DIR . 'blocks/request-signature',
			array(
				'render_callback' => array( __CLASS__, 'render_block' ),
			)
		);
	}

	// ─── Settings of one form ────────────────────────────────────────────────

	/**
	 * A form's settings from shortcode or block attributes, sanitized, with
	 * the defaults from Settings > Salsox filling what is left blank.
	 *
	 * @param array $atts Raw attributes.
	 * @return array
	 */
	public static function config( array $atts ) {
		$defaults = Salsox_Settings::get();

		$source = isset( $atts['source'] ) ? sanitize_key( $atts['source'] ) : '';
		// The shortcode names the document directly: template="nda" implies the source.
		if ( '' === $source || 'default' === $source ) {
			if ( ! empty( $atts['template'] ) ) {
				$source = 'template';
			} elseif ( ! empty( $atts['saved_template'] ) ) {
				$source = 'saved';
			} elseif ( ! empty( $atts['pdf'] ) ) {
				$source = 'pdf';
			}
		}
		if ( ! in_array( $source, array( 'template', 'saved', 'pdf' ), true ) ) {
			$source = $defaults['source'];
			$atts   = array_merge(
				$atts,
				array(
					'template'       => $defaults['template'],
					'saved_template' => $defaults['saved_template'],
					'pdf'            => $defaults['pdf'],
				)
			);
		}

		$values = isset( $atts['values'] ) ? $atts['values'] : '';
		if ( '' === $values && ! empty( $atts['values_text'] ) ) {
			$values = $atts['values_text'];
		}

		return array(
			'source'         => $source,
			'template'       => isset( $atts['template'] ) ? sanitize_key( $atts['template'] ) : '',
			'saved_template' => isset( $atts['saved_template'] ) ? preg_replace( '/[^A-Za-z0-9_-]/', '', (string) $atts['saved_template'] ) : '',
			'pdf'            => isset( $atts['pdf'] ) ? absint( $atts['pdf'] ) : 0,
			'title'          => isset( $atts['title'] ) ? mb_substr( sanitize_text_field( $atts['title'] ), 0, 200 ) : '',
			'message'        => isset( $atts['message'] ) && '' !== trim( (string) $atts['message'] ) ? mb_substr( sanitize_textarea_field( $atts['message'] ), 0, 2000 ) : $defaults['message'],
			'values'         => self::parse_values( $values ),
		);
	}

	/**
	 * Template values from "key=value" pairs, one per line or separated by "|".
	 *
	 * @param string|array $raw Text, or an already parsed array.
	 * @return array<string,string>
	 */
	public static function parse_values( $raw ) {
		$out   = array();
		$pairs = is_array( $raw ) ? $raw : preg_split( '/[\r\n|]+/', (string) $raw );
		foreach ( $pairs as $k => $pair ) {
			if ( is_string( $k ) ) {
				$key   = $k;
				$value = $pair;
			} else {
				$parts = explode( '=', (string) $pair, 2 );
				if ( 2 !== count( $parts ) ) {
					continue;
				}
				list( $key, $value ) = $parts;
			}
			// Template blanks are named in words ("Participant name"), so spaces stay.
			$key = trim( sanitize_text_field( (string) $key ) );
			if ( '' !== $key ) {
				$out[ mb_substr( $key, 0, 80 ) ] = mb_substr( sanitize_text_field( (string) $value ), 0, 2000 );
			}
		}
		return $out;
	}

	/**
	 * The form's settings as a token only this site can produce.
	 *
	 * @param array $config From config().
	 * @return string
	 */
	public static function sign( array $config ) {
		$payload = rtrim( strtr( base64_encode( wp_json_encode( $config ) ), '+/', '-_' ), '=' ); // phpcs:ignore WordPress.PHP.DiscouragedPHPFunctions.obfuscation_base64_encode -- Encodes the form's own settings for transport, not code.
		return $payload . '.' . hash_hmac( 'sha256', $payload, wp_salt( 'auth' ) . 'salsox-form' );
	}

	/**
	 * The settings in a token, or null when it was not produced by this site.
	 *
	 * @param string $token From sign().
	 * @return array|null
	 */
	public static function verify( $token ) {
		$parts = explode( '.', (string) $token );
		if ( 2 !== count( $parts ) ) {
			return null;
		}
		$expected = hash_hmac( 'sha256', $parts[0], wp_salt( 'auth' ) . 'salsox-form' );
		if ( ! hash_equals( $expected, $parts[1] ) ) {
			return null;
		}
		$config = json_decode( base64_decode( strtr( $parts[0], '-_', '+/' ) ), true ); // phpcs:ignore WordPress.PHP.DiscouragedPHPFunctions.obfuscation_base64_decode -- Decodes the form's own signed settings.
		return is_array( $config ) ? $config : null;
	}

	// ─── Rendering ───────────────────────────────────────────────────────────

	/**
	 * [salsox_sign template="…" saved_template="…" pdf="123" title="…" message="…"
	 *  values="key=value|key=value" heading="…" description="…" button="…"]
	 *
	 * @param array|string $atts Shortcode attributes.
	 * @return string
	 */
	public static function shortcode( $atts ) {
		$atts = shortcode_atts(
			array(
				'template'       => '',
				'saved_template' => '',
				'pdf'            => '',
				'title'          => '',
				'message'        => '',
				'values'         => '',
				'heading'        => '',
				'description'    => '',
				'button'         => '',
			),
			$atts,
			'salsox_sign'
		);
		return self::render( $atts );
	}

	/**
	 * The block's server render.
	 *
	 * @param array $attributes Block attributes.
	 * @return string
	 */
	public static function render_block( $attributes ) {
		$atts = array(
			'source'         => isset( $attributes['source'] ) ? $attributes['source'] : 'default',
			'template'       => isset( $attributes['template'] ) ? $attributes['template'] : '',
			'saved_template' => isset( $attributes['savedTemplate'] ) ? $attributes['savedTemplate'] : '',
			'pdf'            => isset( $attributes['pdfId'] ) ? $attributes['pdfId'] : 0,
			'title'          => isset( $attributes['documentTitle'] ) ? $attributes['documentTitle'] : '',
			'message'        => isset( $attributes['message'] ) ? $attributes['message'] : '',
			'values_text'    => isset( $attributes['values'] ) ? $attributes['values'] : '',
			'heading'        => isset( $attributes['heading'] ) ? $attributes['heading'] : '',
			'description'    => isset( $attributes['description'] ) ? $attributes['description'] : '',
			'button'         => isset( $attributes['buttonLabel'] ) ? $attributes['buttonLabel'] : '',
		);
		$wrapper = function_exists( 'get_block_wrapper_attributes' ) ? get_block_wrapper_attributes() : '';
		return self::render( $atts, $wrapper );
	}

	/**
	 * The form.
	 *
	 * @param array  $atts    Shortcode-style attributes.
	 * @param string $wrapper Extra wrapper attributes from the block editor (already escaped by WordPress).
	 * @return string
	 */
	public static function render( array $atts, $wrapper = '' ) {
		wp_enqueue_style( 'salsox-form' );
		wp_enqueue_script( 'salsox-form' );

		$config      = self::config( $atts );
		$token       = self::sign( $config );
		$id          = 'salsox-' . substr( md5( $token . wp_rand() ), 0, 8 );
		$heading     = ! empty( $atts['heading'] ) ? sanitize_text_field( $atts['heading'] ) : __( 'Request a signature', 'salsox' );
		$description = ! empty( $atts['description'] ) ? sanitize_textarea_field( $atts['description'] ) : __( 'Enter your name and email. We will email you the document to read and sign online.', 'salsox' );
		$button      = ! empty( $atts['button'] ) ? sanitize_text_field( $atts['button'] ) : __( 'Email me the document', 'salsox' );
		$problem     = self::setup_problem( $config );
		$settings    = Salsox_Settings::get();

		// The no-JavaScript fallback comes back here with the outcome in the URL.
		$status = isset( $_GET['salsox_status'] ) ? sanitize_key( wp_unslash( $_GET['salsox_status'] ) ) : ''; // phpcs:ignore WordPress.Security.NonceVerification.Recommended -- Only picks which message to show.

		ob_start();
		?>
		<div <?php echo $wrapper; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- get_block_wrapper_attributes() escapes its output. ?>>
		<section class="salsox-sign" id="<?php echo esc_attr( $id ); ?>" aria-labelledby="<?php echo esc_attr( $id . '-heading' ); ?>">
			<div class="salsox-sign__panel" data-salsox-panel="form">
				<h2 class="salsox-sign__heading" id="<?php echo esc_attr( $id . '-heading' ); ?>"><?php echo esc_html( $heading ); ?></h2>
				<p class="salsox-sign__intro"><?php echo esc_html( $description ); ?></p>

				<?php if ( $problem && current_user_can( 'manage_options' ) ) : ?>
					<p class="salsox-sign__notice" role="note">
						<?php
						/* translators: %s: what is wrong with the form's setup. Only administrators see this. */
						echo esc_html( sprintf( __( 'Only administrators see this: %s', 'salsox' ), $problem ) );
						?>
					</p>
				<?php endif; ?>

				<?php if ( $settings['require_login'] && ! is_user_logged_in() ) : ?>
					<p class="salsox-sign__notice">
						<?php esc_html_e( 'Log in to request this document.', 'salsox' ); ?>
						<a href="<?php echo esc_url( wp_login_url( get_permalink() ? get_permalink() : home_url( '/' ) ) ); ?>"><?php esc_html_e( 'Log in', 'salsox' ); ?></a>
					</p>
				<?php else : ?>
					<?php if ( 'sent' === $status ) : ?>
						<p class="salsox-sign__notice salsox-sign__notice--ok" role="status"><?php esc_html_e( 'Sent. Check your inbox for an email from Salsox to read and sign the document.', 'salsox' ); ?></p>
					<?php elseif ( 'error' === $status ) : ?>
						<p class="salsox-sign__notice salsox-sign__notice--bad" role="alert"><?php esc_html_e( 'Your request could not be sent. Try again in a few minutes.', 'salsox' ); ?></p>
					<?php endif; ?>

					<form class="salsox-sign__form" method="post" action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>" novalidate>
						<input type="hidden" name="action" value="salsox_request" />
						<input type="hidden" name="salsox_form" value="<?php echo esc_attr( $token ); ?>" />
						<?php wp_nonce_field( self::NONCE, 'salsox_nonce' ); ?>
						<div class="salsox-sign__fields">
							<p class="salsox-sign__field">
								<label for="<?php echo esc_attr( $id . '-name' ); ?>"><?php esc_html_e( 'Full name', 'salsox' ); ?></label>
								<input id="<?php echo esc_attr( $id . '-name' ); ?>" type="text" name="salsox_name" autocomplete="name" maxlength="120" required />
							</p>
							<p class="salsox-sign__field">
								<label for="<?php echo esc_attr( $id . '-email' ); ?>"><?php esc_html_e( 'Email', 'salsox' ); ?></label>
								<input id="<?php echo esc_attr( $id . '-email' ); ?>" type="email" name="salsox_email" autocomplete="email" inputmode="email" maxlength="254" required />
							</p>
						</div>
						<?php /* A field people never see. Software that fills every field fills this one too, and is refused. */ ?>
						<p class="salsox-sign__trap" aria-hidden="true">
							<label for="<?php echo esc_attr( $id . '-website' ); ?>"><?php esc_html_e( 'Leave this empty', 'salsox' ); ?></label>
							<input id="<?php echo esc_attr( $id . '-website' ); ?>" type="text" name="salsox_website" tabindex="-1" autocomplete="off" />
						</p>
						<div class="salsox-sign__line">
							<button type="submit" class="salsox-sign__button"><?php echo esc_html( $button ); ?></button>
						</div>
						<p class="salsox-sign__error" role="alert" hidden></p>
						<p class="salsox-sign__fine">
							<?php
							/* translators: %s: link to salsox.com */
							echo wp_kses( sprintf( __( 'Signing is handled by %s. Your name and email are used only to send you this document.', 'salsox' ), '<a href="https://salsox.com" rel="noopener" target="_blank">Salsox</a>' ), array( 'a' => array( 'href' => array(), 'rel' => array(), 'target' => array() ) ) );
							?>
						</p>
					</form>
				<?php endif; ?>
			</div>
			<div class="salsox-sign__panel salsox-sign__done" data-salsox-panel="done" hidden tabindex="-1">
				<svg class="salsox-sign__check" viewBox="0 0 48 48" width="48" height="48" aria-hidden="true" focusable="false"><rect width="48" height="48" fill="currentColor"/><path d="M14 25l7 7 13-15" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="square"/></svg>
				<h2 class="salsox-sign__heading"><?php esc_html_e( 'Check your inbox', 'salsox' ); ?></h2>
				<p class="salsox-sign__intro" data-salsox-done-text></p>
				<button type="button" class="salsox-sign__again"><?php esc_html_e( 'Send to another email', 'salsox' ); ?></button>
			</div>
		</section>
		</div>
		<?php
		return (string) ob_get_clean();
	}

	/**
	 * What is wrong with a form's setup, for the administrator viewing the
	 * page, or an empty string. Visitors never see it.
	 *
	 * @param array $config From config().
	 * @return string
	 */
	public static function setup_problem( array $config ) {
		if ( ! Salsox_Api::has_key() ) {
			return __( 'add your Salsox API key in Settings > Salsox.', 'salsox' );
		}
		if ( 'template' === $config['source'] && '' === $config['template'] ) {
			return __( 'choose a template for this form.', 'salsox' );
		}
		if ( 'saved' === $config['source'] && '' === $config['saved_template'] ) {
			return __( 'choose a saved template for this form.', 'salsox' );
		}
		if ( 'pdf' === $config['source'] ) {
			$pdf = self::pdf_url( $config['pdf'] );
			if ( is_wp_error( $pdf ) ) {
				return $pdf->get_error_message();
			}
		}
		if ( ! in_array( $config['source'], array( 'template', 'saved', 'pdf' ), true ) ) {
			return __( 'choose which document this form sends, here or in Settings > Salsox.', 'salsox' );
		}
		return '';
	}

	/**
	 * The public link Salsox downloads a Media Library PDF from.
	 *
	 * @param int $attachment_id Attachment ID.
	 * @return string|WP_Error
	 */
	public static function pdf_url( $attachment_id ) {
		$attachment_id = absint( $attachment_id );
		if ( ! $attachment_id || 'application/pdf' !== get_post_mime_type( $attachment_id ) ) {
			return new WP_Error( 'salsox_pdf', __( 'choose a PDF from the Media Library for this form.', 'salsox' ) );
		}
		$file = get_attached_file( $attachment_id );
		if ( $file && file_exists( $file ) && filesize( $file ) > self::MAX_PDF_BYTES ) {
			return new WP_Error( 'salsox_pdf', __( 'the PDF is larger than 4 MB, the most Salsox accepts.', 'salsox' ) );
		}
		$url = wp_get_attachment_url( $attachment_id );
		if ( ! $url || 0 !== strpos( $url, 'https://' ) ) {
			return new WP_Error( 'salsox_pdf', __( 'Salsox downloads the PDF from your site, so the site must be public and use HTTPS. Use a template instead, or serve the site over HTTPS.', 'salsox' ) );
		}
		return $url;
	}

	// ─── Submission ──────────────────────────────────────────────────────────

	/**
	 * Sends the document for one submission.
	 *
	 * @param array $input name, email, website (honeypot), token. Unslashed, not yet sanitized.
	 * @return array|WP_Error { title, email } on success. The error message is safe to show a visitor.
	 */
	public static function submit( array $input ) {
		$generic = __( 'Your request could not be sent. Try again in a few minutes.', 'salsox' );
		$settings = Salsox_Settings::get();

		// Software fills the hidden field; it is told it succeeded and nothing is sent.
		if ( ! empty( $input['website'] ) ) {
			return array(
				'title' => '',
				'email' => '',
			);
		}
		if ( $settings['require_login'] && ! is_user_logged_in() ) {
			return new WP_Error( 'salsox_login', __( 'Log in to request this document.', 'salsox' ), array( 'status' => 403 ) );
		}

		$config = self::verify( isset( $input['token'] ) ? $input['token'] : '' );
		if ( ! $config ) {
			return new WP_Error( 'salsox_form', __( 'This form is out of date. Reload the page and try again.', 'salsox' ), array( 'status' => 400 ) );
		}

		$name  = mb_substr( sanitize_text_field( isset( $input['name'] ) ? $input['name'] : '' ), 0, 120 );
		$email = sanitize_email( isset( $input['email'] ) ? $input['email'] : '' );
		if ( '' === $name ) {
			return new WP_Error( 'salsox_name', __( 'Enter your full name.', 'salsox' ), array( 'status' => 422 ) );
		}
		if ( ! is_email( $email ) ) {
			return new WP_Error( 'salsox_email', __( 'Enter a valid email address.', 'salsox' ), array( 'status' => 422 ) );
		}

		$limited = self::over_limits( $email, $settings );
		if ( $limited ) {
			return new WP_Error( 'salsox_limited', $limited, array( 'status' => 429 ) );
		}

		$body = array(
			'recipients' => array(
				array(
					'email' => $email,
					'name'  => $name,
					'role'  => 'SIGNER',
				),
			),
		);
		if ( '' !== $config['title'] ) {
			$body['title'] = $config['title'];
		}
		if ( '' !== $config['message'] ) {
			$body['message'] = $config['message'];
		}
		// A blank that belongs to the visitor ("Participant name={name}") takes what they typed.
		$values = array();
		foreach ( $config['values'] as $key => $value ) {
			$values[ $key ] = str_replace( array( '{name}', '{email}' ), array( $name, $email ), $value );
		}
		if ( 'template' === $config['source'] && '' !== $config['template'] ) {
			$body['template'] = $config['template'];
			$body['values']   = (object) $values;
		} elseif ( 'saved' === $config['source'] && '' !== $config['saved_template'] ) {
			$body['saved_template_id'] = $config['saved_template'];
			$body['values']            = (object) $values;
		} elseif ( 'pdf' === $config['source'] ) {
			$url = self::pdf_url( $config['pdf'] );
			if ( is_wp_error( $url ) ) {
				return self::owner_error( $url, $generic );
			}
			$body['file_url'] = $url;
		} else {
			return self::owner_error( new WP_Error( 'salsox_setup', self::setup_problem( $config ) ), $generic );
		}

		$sent = Salsox_Api::send_document( $body );
		if ( is_wp_error( $sent ) ) {
			return self::owner_error( $sent, $generic );
		}

		self::count( $email );
		self::log(
			array(
				'id'    => isset( $sent['id'] ) ? sanitize_text_field( $sent['id'] ) : '',
				'title' => isset( $sent['title'] ) ? sanitize_text_field( $sent['title'] ) : '',
				'name'  => $name,
				'email' => $email,
				'at'    => time(),
			)
		);

		if ( ! empty( $sent['undelivered'] ) || ! empty( $sent['not_emailed'] ) ) {
			return new WP_Error( 'salsox_undelivered', __( 'The document was created, but the email to you could not be delivered. Check the address and try again, or contact us.', 'salsox' ), array( 'status' => 502 ) );
		}
		return array(
			'title' => isset( $sent['title'] ) ? sanitize_text_field( $sent['title'] ) : '',
			'email' => $email,
		);
	}

	/**
	 * A failure the site owner has to fix: the visitor gets the plain message,
	 * an administrator testing the form sees what Salsox said.
	 *
	 * @param WP_Error $error   What went wrong.
	 * @param string   $generic What a visitor is told.
	 * @return WP_Error
	 */
	private static function owner_error( WP_Error $error, $generic ) {
		$data   = $error->get_error_data();
		$status = is_array( $data ) && isset( $data['status'] ) ? (int) $data['status'] : 502;
		if ( 429 === $status ) {
			$generic = __( 'Too many requests right now. Try again in a few minutes.', 'salsox' );
		}
		$message = current_user_can( 'manage_options' ) ? $error->get_error_message() : $generic;
		return new WP_Error( $error->get_error_code(), $message, array( 'status' => $status >= 400 ? $status : 502 ) );
	}

	/**
	 * The limits this site applies before calling Salsox.
	 *
	 * @param string $email    The address the document would go to.
	 * @param array  $settings Plugin settings.
	 * @return string The refusal to show, or an empty string.
	 */
	private static function over_limits( $email, array $settings ) {
		$per_visitor = (int) get_transient( self::visitor_key() );
		$per_email   = (int) get_transient( 'salsox_e_' . md5( strtolower( $email ) ) );
		$today       = (int) get_transient( 'salsox_day_' . gmdate( 'Ymd' ) );

		if ( $today >= $settings['daily_limit'] ) {
			return __( 'This form has reached its limit for today. Try again tomorrow.', 'salsox' );
		}
		if ( $per_visitor >= $settings['hourly_limit'] || $per_email >= $settings['hourly_limit'] ) {
			return __( 'You have made several requests already. Check your inbox, or try again in an hour.', 'salsox' );
		}
		return '';
	}

	/**
	 * Counts a sent request against the limits.
	 *
	 * @param string $email Recipient.
	 */
	private static function count( $email ) {
		$visitor = self::visitor_key();
		$by      = 'salsox_e_' . md5( strtolower( $email ) );
		$day     = 'salsox_day_' . gmdate( 'Ymd' );
		set_transient( $visitor, (int) get_transient( $visitor ) + 1, HOUR_IN_SECONDS );
		set_transient( $by, (int) get_transient( $by ) + 1, HOUR_IN_SECONDS );
		set_transient( $day, (int) get_transient( $day ) + 1, DAY_IN_SECONDS );
	}

	/**
	 * The visitor's limit counter. The address is hashed with the site's salt
	 * and never stored as is.
	 *
	 * @return string
	 */
	private static function visitor_key() {
		$ip = isset( $_SERVER['REMOTE_ADDR'] ) ? sanitize_text_field( wp_unslash( $_SERVER['REMOTE_ADDR'] ) ) : '';
		return 'salsox_v_' . substr( wp_hash( $ip, 'nonce' ), 0, 20 );
	}

	/**
	 * Keeps the request in the log shown on Settings > Salsox.
	 *
	 * @param array $entry id, title, name, email, at.
	 */
	private static function log( array $entry ) {
		$log = get_option( self::LOG_OPTION, array() );
		$log = is_array( $log ) ? $log : array();
		array_unshift( $log, $entry );
		update_option( self::LOG_OPTION, array_slice( $log, 0, self::LOG_SIZE ), false );
	}

	/**
	 * The no-JavaScript submission: sends, then returns to the page with the outcome.
	 */
	public static function handle_post() {
		$back = wp_get_referer() ? wp_get_referer() : home_url( '/' );
		$back = remove_query_arg( 'salsox_status', $back );

		if ( ! isset( $_POST['salsox_nonce'] ) || ! wp_verify_nonce( sanitize_text_field( wp_unslash( $_POST['salsox_nonce'] ) ), self::NONCE ) ) {
			wp_safe_redirect( add_query_arg( 'salsox_status', 'error', $back ) );
			exit;
		}
		$result = self::submit(
			array(
				'name'    => isset( $_POST['salsox_name'] ) ? sanitize_text_field( wp_unslash( $_POST['salsox_name'] ) ) : '',
				'email'   => isset( $_POST['salsox_email'] ) ? sanitize_email( wp_unslash( $_POST['salsox_email'] ) ) : '',
				'website' => isset( $_POST['salsox_website'] ) ? sanitize_text_field( wp_unslash( $_POST['salsox_website'] ) ) : '',
				'token'   => isset( $_POST['salsox_form'] ) ? sanitize_text_field( wp_unslash( $_POST['salsox_form'] ) ) : '',
			)
		);
		wp_safe_redirect( add_query_arg( 'salsox_status', is_wp_error( $result ) ? 'error' : 'sent', $back ) );
		exit;
	}
}
