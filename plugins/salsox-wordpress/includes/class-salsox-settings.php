<?php
/**
 * Settings > Salsox: where the site owner connects the plugin to their
 * Salsox account and decides what the forms send.
 *
 *   Connection        the API key (write-only: never shown again once saved),
 *                     a connection test against GET /api/v1/me, and Disconnect,
 *                     which also revokes the key at Salsox
 *   Default document  what a form sends when it does not name its own
 *   Protection        logged-in visitors only, and the hourly and daily limits
 *   Add the form      the shortcode and the block, with examples
 *   Recent requests   the last requests sent from this site, with their status
 *
 * Only users who can manage options see the page or reach its actions; every
 * action checks a nonce.
 *
 * @package Salsox
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * The settings page and the stored settings.
 */
class Salsox_Settings {

	/** Option holding everything but the key. */
	const OPTION = 'salsox_settings';

	/** Transient holding the account from the last connection test. */
	const ACCOUNT_CACHE = 'salsox_account';

	/** Where a Salsox account creates API keys. */
	const DEVELOPERS_URL = 'https://salsox.com/dashboard/developers';

	/**
	 * Hooks the page, the settings and the actions.
	 */
	public static function init() {
		add_action( 'admin_menu', array( __CLASS__, 'menu' ) );
		add_action( 'admin_init', array( __CLASS__, 'register' ) );
		add_action( 'admin_init', array( __CLASS__, 'privacy' ) );
		add_action( 'admin_enqueue_scripts', array( __CLASS__, 'assets' ) );
		add_action( 'admin_post_salsox_test', array( __CLASS__, 'action_test' ) );
		add_action( 'admin_post_salsox_disconnect', array( __CLASS__, 'action_disconnect' ) );
		add_action( 'update_option_' . Salsox_Api::KEY_OPTION, array( __CLASS__, 'key_changed' ) );
		add_action( 'add_option_' . Salsox_Api::KEY_OPTION, array( __CLASS__, 'key_changed' ) );
	}

	/**
	 * The defaults.
	 *
	 * @return array
	 */
	public static function defaults() {
		return array(
			'source'         => '',
			'template'       => '',
			'saved_template' => '',
			'pdf'            => 0,
			'message'        => '',
			'require_login'  => false,
			'hourly_limit'   => 3,
			'daily_limit'    => 25,
		);
	}

	/**
	 * The stored settings, with defaults for anything missing.
	 *
	 * @return array
	 */
	public static function get() {
		$saved = get_option( self::OPTION, array() );
		return array_merge( self::defaults(), is_array( $saved ) ? $saved : array() );
	}

	/**
	 * Adds Settings > Salsox.
	 */
	public static function menu() {
		add_options_page( __( 'Salsox', 'salsox' ), __( 'Salsox', 'salsox' ), 'manage_options', 'salsox', array( __CLASS__, 'page' ) );
	}

	/**
	 * Registers the two options with their sanitizers.
	 */
	public static function register() {
		register_setting(
			'salsox',
			Salsox_Api::KEY_OPTION,
			array(
				'type'              => 'string',
				'sanitize_callback' => array( __CLASS__, 'sanitize_key_input' ),
				'show_in_rest'      => false,
				'default'           => '',
			)
		);
		register_setting(
			'salsox',
			self::OPTION,
			array(
				'type'              => 'array',
				'sanitize_callback' => array( __CLASS__, 'sanitize' ),
				'show_in_rest'      => false,
				'default'           => self::defaults(),
			)
		);
	}

	/**
	 * The key field is write-only: left blank, the saved key stays.
	 *
	 * @param mixed $value Submitted value.
	 * @return string
	 */
	public static function sanitize_key_input( $value ) {
		$value = is_string( $value ) ? trim( sanitize_text_field( $value ) ) : '';
		if ( '' === $value ) {
			return Salsox_Api::key();
		}
		if ( ! preg_match( '/^[A-Za-z0-9_.-]{20,200}$/', $value ) ) {
			add_settings_error( 'salsox', 'salsox_key_format', __( 'That does not look like a Salsox API key. Copy the whole key, starting with ak_, from the Developers page in Salsox.', 'salsox' ) );
			return Salsox_Api::key();
		}
		return $value;
	}

	/**
	 * Sanitizes the settings.
	 *
	 * @param mixed $input Submitted values.
	 * @return array
	 */
	public static function sanitize( $input ) {
		$input = is_array( $input ) ? $input : array();
		$out   = self::defaults();

		$source        = isset( $input['source'] ) ? sanitize_key( $input['source'] ) : '';
		$out['source'] = in_array( $source, array( 'template', 'saved', 'pdf' ), true ) ? $source : '';

		$out['template']       = isset( $input['template'] ) ? sanitize_key( $input['template'] ) : '';
		$out['saved_template'] = isset( $input['saved_template'] ) ? preg_replace( '/[^A-Za-z0-9_-]/', '', (string) $input['saved_template'] ) : '';
		$out['pdf']            = isset( $input['pdf'] ) ? absint( $input['pdf'] ) : 0;
		$out['message']        = isset( $input['message'] ) ? mb_substr( sanitize_textarea_field( $input['message'] ), 0, 2000 ) : '';
		$out['require_login']  = ! empty( $input['require_login'] );
		$out['hourly_limit']   = isset( $input['hourly_limit'] ) ? min( 20, max( 1, absint( $input['hourly_limit'] ) ) ) : 3;
		$out['daily_limit']    = isset( $input['daily_limit'] ) ? min( 500, max( 1, absint( $input['daily_limit'] ) ) ) : 25;

		if ( 'pdf' === $out['source'] && $out['pdf'] && 'application/pdf' !== get_post_mime_type( $out['pdf'] ) ) {
			add_settings_error( 'salsox', 'salsox_pdf', __( 'The chosen file is not a PDF.', 'salsox' ) );
			$out['pdf'] = 0;
		}
		return $out;
	}

	/**
	 * A new key: forget what the old one saw, and test the new one.
	 */
	public static function key_changed() {
		delete_transient( Salsox_Api::TEMPLATES_CACHE );
		delete_transient( self::ACCOUNT_CACHE );
		if ( Salsox_Api::has_key() ) {
			self::test();
		}
	}

	/**
	 * Tests the saved key and remembers the outcome for the page.
	 *
	 * @return array|WP_Error
	 */
	public static function test() {
		$me = Salsox_Api::me();
		if ( is_wp_error( $me ) ) {
			set_transient(
				self::ACCOUNT_CACHE,
				array(
					'ok'    => false,
					'error' => $me->get_error_message(),
					'code'  => $me->get_error_code(),
				),
				HOUR_IN_SECONDS
			);
			return $me;
		}
		$plan = isset( $me['plan'] ) && is_array( $me['plan'] ) ? $me['plan'] : array();
		set_transient(
			self::ACCOUNT_CACHE,
			array(
				'ok'             => true,
				'name'           => sanitize_text_field( isset( $me['name'] ) ? (string) $me['name'] : '' ),
				'email'          => sanitize_email( isset( $me['email'] ) ? $me['email'] : '' ),
				'tier'           => sanitize_text_field( isset( $plan['tier'] ) ? (string) $plan['tier'] : '' ),
				'documents_left' => isset( $plan['documents_left'] ) && null !== $plan['documents_left'] ? absint( $plan['documents_left'] ) : null,
				'at'             => time(),
			),
			DAY_IN_SECONDS
		);
		return $me;
	}

	/**
	 * "Test connection".
	 */
	public static function action_test() {
		self::guard( 'salsox_test' );
		$result = self::test();
		self::back( is_wp_error( $result ) ? 'test_failed' : 'test_ok' );
	}

	/**
	 * "Disconnect": revokes the key at Salsox, then forgets it here.
	 */
	public static function action_disconnect() {
		self::guard( 'salsox_disconnect' );
		$revoked = Salsox_Api::has_key() ? Salsox_Api::revoke_key() : array();
		delete_option( Salsox_Api::KEY_OPTION );
		delete_transient( Salsox_Api::TEMPLATES_CACHE );
		delete_transient( self::ACCOUNT_CACHE );
		self::back( is_wp_error( $revoked ) ? 'disconnected_local' : 'disconnected' );
	}

	/**
	 * Stops anyone who may not manage options, or whose nonce does not match.
	 *
	 * @param string $action Nonce action.
	 */
	private static function guard( $action ) {
		if ( ! current_user_can( 'manage_options' ) ) {
			wp_die( esc_html__( 'You are not allowed to change the Salsox settings.', 'salsox' ), 403 );
		}
		check_admin_referer( $action );
	}

	/**
	 * Back to the page with a notice.
	 *
	 * @param string $notice Notice key.
	 */
	private static function back( $notice ) {
		wp_safe_redirect( add_query_arg( 'salsox_notice', $notice, admin_url( 'options-general.php?page=salsox' ) ) );
		exit;
	}

	/**
	 * Suggested text for the site's privacy policy.
	 */
	public static function privacy() {
		if ( ! function_exists( 'wp_add_privacy_policy_content' ) ) {
			return;
		}
		wp_add_privacy_policy_content(
			__( 'Salsox', 'salsox' ),
			wp_kses_post(
				'<p>' . __( 'When you request a document to sign through a form on this site, the name and email address you enter are sent to Salsox (salsox.com), which emails you the document and records your signature. This site keeps your name, email address and the time of the request in a log of the last 50 requests, which administrators can see.', 'salsox' ) . '</p>'
			)
		);
	}

	/**
	 * The page's styles and script, on the page only.
	 *
	 * @param string $hook Current admin page.
	 */
	public static function assets( $hook ) {
		if ( 'settings_page_salsox' !== $hook ) {
			return;
		}
		wp_enqueue_media();
		wp_enqueue_style( 'salsox-admin', SALSOX_URL . 'assets/css/salsox-admin.css', array(), SALSOX_VERSION );
		wp_enqueue_script( 'salsox-admin', SALSOX_URL . 'assets/js/salsox-admin.js', array(), SALSOX_VERSION, true );
		wp_localize_script(
			'salsox-admin',
			'salsoxAdmin',
			array(
				'choosePdf' => __( 'Choose a PDF', 'salsox' ),
				'usePdf'    => __( 'Use this PDF', 'salsox' ),
				'copied'    => __( 'Copied', 'salsox' ),
			)
		);
	}

	// ─── The page ────────────────────────────────────────────────────────────

	/**
	 * Renders Settings > Salsox.
	 */
	public static function page() {
		if ( ! current_user_can( 'manage_options' ) ) {
			return;
		}
		$settings  = self::get();
		$has_key   = Salsox_Api::has_key();
		$account   = get_transient( self::ACCOUNT_CACHE );
		$templates = $has_key ? Salsox_Rest::sendable_templates() : null;
		$notice    = isset( $_GET['salsox_notice'] ) ? sanitize_key( wp_unslash( $_GET['salsox_notice'] ) ) : ''; // phpcs:ignore WordPress.Security.NonceVerification.Recommended -- Only picks which notice to show.
		$notices   = array(
			'test_ok'            => array( 'ok', __( 'Connected. Salsox accepted the API key.', 'salsox' ) ),
			'test_failed'        => array( 'bad', __( 'The connection test failed. See the message below.', 'salsox' ) ),
			'disconnected'       => array( 'ok', __( 'Disconnected. The API key was revoked at Salsox and removed from this site.', 'salsox' ) ),
			'disconnected_local' => array( 'warn', __( 'The API key was removed from this site, but Salsox could not be reached to revoke it. Revoke it on the Developers page in Salsox.', 'salsox' ) ),
		);
		?>
		<div class="wrap salsox-admin">
			<header class="salsox-admin__head">
				<img src="<?php echo esc_url( SALSOX_URL . 'assets/images/salsox-icon.svg' ); ?>" width="40" height="40" alt="" />
				<div>
					<h1><?php esc_html_e( 'Salsox', 'salsox' ); ?></h1>
					<p><?php esc_html_e( 'Let visitors request your documents and sign them online.', 'salsox' ); ?></p>
				</div>
			</header>

			<?php settings_errors( 'salsox' ); ?>
			<?php if ( isset( $notices[ $notice ] ) ) : ?>
				<div class="salsox-admin__flash salsox-admin__flash--<?php echo esc_attr( $notices[ $notice ][0] ); ?>" role="status"><p><?php echo esc_html( $notices[ $notice ][1] ); ?></p></div>
			<?php endif; ?>

			<div class="salsox-admin__grid">
				<form method="post" action="options.php" class="salsox-admin__main">
					<?php settings_fields( 'salsox' ); ?>

					<section class="salsox-card">
						<h2><?php esc_html_e( 'Connection', 'salsox' ); ?></h2>
						<?php self::connection_status( $has_key, $account ); ?>
						<p class="salsox-field">
							<label for="salsox-key"><?php esc_html_e( 'API key', 'salsox' ); ?></label>
							<input id="salsox-key" type="password" name="<?php echo esc_attr( Salsox_Api::KEY_OPTION ); ?>" value="" autocomplete="off" spellcheck="false" placeholder="<?php echo $has_key ? esc_attr__( 'A key is saved. Paste a new one to replace it.', 'salsox' ) : 'ak_…'; ?>" aria-describedby="salsox-key-help" />
							<span class="salsox-help" id="salsox-key-help">
								<?php
								/* translators: %s: link to the Developers page in Salsox. */
								echo wp_kses( sprintf( __( 'Create a key on the %s in Salsox, then paste it here. It is stored on this site only and never shown again.', 'salsox' ), '<a href="' . esc_url( self::DEVELOPERS_URL ) . '" target="_blank" rel="noopener">' . esc_html__( 'Developers page', 'salsox' ) . '</a>' ), array( 'a' => array( 'href' => array(), 'target' => array(), 'rel' => array() ) ) );
								?>
							</span>
						</p>
					</section>

					<section class="salsox-card">
						<h2><?php esc_html_e( 'Default document', 'salsox' ); ?></h2>
						<p class="salsox-help"><?php esc_html_e( 'What a form sends when it does not choose its own document. Each visitor is the only signer; you are filled in as the sender.', 'salsox' ); ?></p>
						<?php self::source_fields( $settings, $templates ); ?>
						<p class="salsox-field">
							<label for="salsox-message"><?php esc_html_e( 'Message in the email', 'salsox' ); ?> <span class="salsox-optional"><?php esc_html_e( '(optional)', 'salsox' ); ?></span></label>
							<textarea id="salsox-message" name="salsox_settings[message]" rows="3" maxlength="2000"><?php echo esc_textarea( $settings['message'] ); ?></textarea>
						</p>
					</section>

					<section class="salsox-card">
						<h2><?php esc_html_e( 'Protection', 'salsox' ); ?></h2>
						<p class="salsox-help"><?php esc_html_e( 'Every request sends a real document from your account and counts toward your Salsox plan. These limits stop a form from being misused.', 'salsox' ); ?></p>
						<p class="salsox-check">
							<input id="salsox-login" type="checkbox" name="salsox_settings[require_login]" value="1" <?php checked( $settings['require_login'] ); ?> />
							<label for="salsox-login"><?php esc_html_e( 'Only logged-in visitors can request documents', 'salsox' ); ?></label>
						</p>
						<div class="salsox-pair">
							<p class="salsox-field">
								<label for="salsox-hourly"><?php esc_html_e( 'Requests per visitor per hour', 'salsox' ); ?></label>
								<input id="salsox-hourly" type="number" min="1" max="20" name="salsox_settings[hourly_limit]" value="<?php echo esc_attr( (string) $settings['hourly_limit'] ); ?>" />
							</p>
							<p class="salsox-field">
								<label for="salsox-daily"><?php esc_html_e( 'Requests per day, whole site', 'salsox' ); ?></label>
								<input id="salsox-daily" type="number" min="1" max="500" name="salsox_settings[daily_limit]" value="<?php echo esc_attr( (string) $settings['daily_limit'] ); ?>" />
							</p>
						</div>
					</section>

					<div class="salsox-admin__save">
						<?php submit_button( __( 'Save settings', 'salsox' ), 'primary salsox-button', 'submit', false ); ?>
					</div>
				</form>

				<aside class="salsox-admin__side">
					<?php if ( $has_key ) : ?>
						<section class="salsox-card">
							<h2><?php esc_html_e( 'Account', 'salsox' ); ?></h2>
							<div class="salsox-actions">
								<form method="post" action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>">
									<input type="hidden" name="action" value="salsox_test" />
									<?php wp_nonce_field( 'salsox_test' ); ?>
									<button type="submit" class="button salsox-button-secondary"><?php esc_html_e( 'Test connection', 'salsox' ); ?></button>
								</form>
								<form method="post" action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>" data-salsox-confirm="<?php esc_attr_e( 'Disconnect this site from Salsox? The API key will be revoked and the forms will stop sending.', 'salsox' ); ?>">
									<input type="hidden" name="action" value="salsox_disconnect" />
									<?php wp_nonce_field( 'salsox_disconnect' ); ?>
									<button type="submit" class="button salsox-button-quiet"><?php esc_html_e( 'Disconnect', 'salsox' ); ?></button>
								</form>
							</div>
						</section>
					<?php endif; ?>

					<section class="salsox-card">
						<h2><?php esc_html_e( 'Add the form to a page', 'salsox' ); ?></h2>
						<p class="salsox-help"><?php esc_html_e( 'In the block editor, add the "Request a signature" block. Anywhere else, use the shortcode:', 'salsox' ); ?></p>
						<div class="salsox-code">
							<code id="salsox-shortcode">[salsox_sign]</code>
							<button type="button" class="button-link" data-salsox-copy="salsox-shortcode"><?php esc_html_e( 'Copy', 'salsox' ); ?></button>
						</div>
						<p class="salsox-help"><?php esc_html_e( 'To send a different document from one page:', 'salsox' ); ?></p>
						<ul class="salsox-examples">
							<li><code>[salsox_sign template="liability-waiver"]</code></li>
							<li><code>[salsox_sign pdf="123" title="Membership agreement"]</code></li>
							<li><code>[salsox_sign heading="Sign up" button="Send me the form"]</code></li>
						</ul>
					</section>
				</aside>
			</div>

			<?php self::recent_requests( $has_key ); ?>
		</div>
		<?php
	}

	/**
	 * The connection's state, from the last test.
	 *
	 * @param bool        $has_key Whether a key is saved.
	 * @param array|false $account The last test's outcome.
	 */
	private static function connection_status( $has_key, $account ) {
		if ( ! $has_key ) {
			echo '<p class="salsox-status salsox-status--off"><span aria-hidden="true"></span>' . esc_html__( 'Not connected', 'salsox' ) . '</p>';
			return;
		}
		if ( ! is_array( $account ) ) {
			echo '<p class="salsox-status salsox-status--warn"><span aria-hidden="true"></span>' . esc_html__( 'A key is saved. Test the connection to check it.', 'salsox' ) . '</p>';
			return;
		}
		if ( empty( $account['ok'] ) ) {
			echo '<p class="salsox-status salsox-status--bad"><span aria-hidden="true"></span>' . esc_html( $account['error'] ) . '</p>';
			return;
		}
		$who = '' !== $account['name'] ? $account['name'] . ' (' . $account['email'] . ')' : $account['email'];
		echo '<p class="salsox-status salsox-status--ok"><span aria-hidden="true"></span>';
		/* translators: %s: the Salsox account's name and email. */
		echo esc_html( sprintf( __( 'Connected as %s', 'salsox' ), $who ) );
		echo '</p>';
		if ( null !== $account['documents_left'] ) {
			echo '<p class="salsox-help">';
			/* translators: %d: documents the account can still send this month. */
			echo esc_html( sprintf( _n( '%d document left this month on your plan.', '%d documents left this month on your plan.', $account['documents_left'], 'salsox' ), $account['documents_left'] ) );
			echo '</p>';
		}
	}

	/**
	 * The default document's fields.
	 *
	 * @param array              $settings  Settings.
	 * @param array|WP_Error|null $templates Sendable templates, or null when not connected.
	 */
	private static function source_fields( array $settings, $templates ) {
		$have_list = is_array( $templates );
		?>
		<fieldset class="salsox-sources">
			<legend class="screen-reader-text"><?php esc_html_e( 'Document', 'salsox' ); ?></legend>
			<?php
			$choices = array(
				'template' => __( 'A Salsox template', 'salsox' ),
				'saved'    => __( 'One of my saved templates', 'salsox' ),
				'pdf'      => __( 'A PDF from the Media Library', 'salsox' ),
			);
			foreach ( $choices as $value => $label ) :
				?>
				<label class="salsox-source">
					<input type="radio" name="salsox_settings[source]" value="<?php echo esc_attr( $value ); ?>" <?php checked( $settings['source'], $value ); ?> />
					<span><?php echo esc_html( $label ); ?></span>
				</label>
			<?php endforeach; ?>
		</fieldset>

		<?php if ( is_wp_error( $templates ) ) : ?>
			<p class="salsox-help salsox-help--bad"><?php echo esc_html( $templates->get_error_message() ); ?></p>
		<?php endif; ?>

		<p class="salsox-field" data-salsox-source="template">
			<label for="salsox-template"><?php esc_html_e( 'Template', 'salsox' ); ?></label>
			<?php if ( $have_list ) : ?>
				<select id="salsox-template" name="salsox_settings[template]">
					<option value=""><?php esc_html_e( 'Choose a template', 'salsox' ); ?></option>
					<?php foreach ( $templates['library'] as $t ) : ?>
						<option value="<?php echo esc_attr( $t['slug'] ); ?>" <?php selected( $settings['template'], $t['slug'] ); ?>><?php echo esc_html( $t['title'] ); ?></option>
					<?php endforeach; ?>
				</select>
			<?php else : ?>
				<input id="salsox-template" type="text" name="salsox_settings[template]" value="<?php echo esc_attr( $settings['template'] ); ?>" placeholder="liability-waiver" />
			<?php endif; ?>
			<span class="salsox-help"><?php esc_html_e( 'Templates with one signer besides you.', 'salsox' ); ?></span>
		</p>

		<p class="salsox-field" data-salsox-source="saved">
			<label for="salsox-saved"><?php esc_html_e( 'Saved template', 'salsox' ); ?></label>
			<?php if ( $have_list && $templates['saved'] ) : ?>
				<select id="salsox-saved" name="salsox_settings[saved_template]">
					<option value=""><?php esc_html_e( 'Choose a saved template', 'salsox' ); ?></option>
					<?php foreach ( $templates['saved'] as $s ) : ?>
						<option value="<?php echo esc_attr( $s['id'] ); ?>" <?php selected( $settings['saved_template'], $s['id'] ); ?>><?php echo esc_html( $s['name'] ); ?></option>
					<?php endforeach; ?>
				</select>
			<?php elseif ( $have_list ) : ?>
				<input type="hidden" name="salsox_settings[saved_template]" value="<?php echo esc_attr( $settings['saved_template'] ); ?>" />
				<span class="salsox-help"><?php esc_html_e( 'You have no saved templates with one signer yet. Fill in a template in Salsox and save it to use it here.', 'salsox' ); ?></span>
			<?php else : ?>
				<input id="salsox-saved" type="text" name="salsox_settings[saved_template]" value="<?php echo esc_attr( $settings['saved_template'] ); ?>" />
			<?php endif; ?>
		</p>

		<div class="salsox-field" data-salsox-source="pdf">
			<span class="salsox-label"><?php esc_html_e( 'PDF', 'salsox' ); ?></span>
			<input type="hidden" id="salsox-pdf" name="salsox_settings[pdf]" value="<?php echo esc_attr( (string) $settings['pdf'] ); ?>" />
			<div class="salsox-pdf">
				<span id="salsox-pdf-name"><?php echo $settings['pdf'] ? esc_html( get_the_title( $settings['pdf'] ) ) : esc_html__( 'No PDF chosen', 'salsox' ); ?></span>
				<button type="button" class="button salsox-button-secondary" data-salsox-pick-pdf><?php esc_html_e( 'Choose PDF', 'salsox' ); ?></button>
			</div>
			<?php
			$problem = $settings['pdf'] ? Salsox_Form::pdf_url( $settings['pdf'] ) : null;
			if ( is_wp_error( $problem ) ) :
				?>
				<span class="salsox-help salsox-help--bad"><?php echo esc_html( ucfirst( $problem->get_error_message() ) ); ?></span>
			<?php endif; ?>
			<span class="salsox-help"><?php esc_html_e( 'Up to 4 MB. Salsox adds a signature and a date for the visitor. Your site must be public and use HTTPS so Salsox can download the file.', 'salsox' ); ?></span>
		</div>
		<?php
	}

	/**
	 * The last requests sent from this site, with each document's status at Salsox.
	 *
	 * @param bool $has_key Whether a key is saved.
	 */
	private static function recent_requests( $has_key ) {
		$log = get_option( Salsox_Form::LOG_OPTION, array() );
		$log = is_array( $log ) ? $log : array();

		$statuses = array();
		if ( $has_key && $log ) {
			$docs = Salsox_Api::documents( 100 );
			if ( ! is_wp_error( $docs ) && isset( $docs['data'] ) ) {
				foreach ( (array) $docs['data'] as $doc ) {
					if ( isset( $doc['id'], $doc['status'] ) ) {
						$statuses[ $doc['id'] ] = $doc;
					}
				}
			}
		}
		$labels = array(
			'PENDING'   => __( 'Waiting for signature', 'salsox' ),
			'COMPLETED' => __( 'Signed', 'salsox' ),
			'REJECTED'  => __( 'Declined', 'salsox' ),
			'EXPIRED'   => __( 'Expired', 'salsox' ),
			'CANCELLED' => __( 'Cancelled', 'salsox' ),
			'DRAFT'     => __( 'Draft', 'salsox' ),
		);
		?>
		<section class="salsox-card salsox-requests">
			<h2><?php esc_html_e( 'Recent requests', 'salsox' ); ?></h2>
			<?php if ( ! $log ) : ?>
				<p class="salsox-help"><?php esc_html_e( 'Requests sent from your forms appear here, with whether they have been signed.', 'salsox' ); ?></p>
			<?php else : ?>
				<table class="salsox-table">
					<thead>
						<tr>
							<th scope="col"><?php esc_html_e( 'Visitor', 'salsox' ); ?></th>
							<th scope="col"><?php esc_html_e( 'Document', 'salsox' ); ?></th>
							<th scope="col"><?php esc_html_e( 'Requested', 'salsox' ); ?></th>
							<th scope="col"><?php esc_html_e( 'Status', 'salsox' ); ?></th>
						</tr>
					</thead>
					<tbody>
						<?php
						foreach ( $log as $row ) :
							$doc    = isset( $statuses[ $row['id'] ] ) ? $statuses[ $row['id'] ] : null;
							$status = $doc ? (string) $doc['status'] : '';
							?>
							<tr>
								<td data-label="<?php esc_attr_e( 'Visitor', 'salsox' ); ?>"><strong><?php echo esc_html( $row['name'] ); ?></strong><br /><span class="salsox-muted"><?php echo esc_html( $row['email'] ); ?></span></td>
								<td data-label="<?php esc_attr_e( 'Document', 'salsox' ); ?>">
									<?php if ( $doc && ! empty( $doc['url'] ) ) : ?>
										<a href="<?php echo esc_url( $doc['url'] ); ?>" target="_blank" rel="noopener"><?php echo esc_html( $row['title'] ); ?></a>
									<?php else : ?>
										<?php echo esc_html( $row['title'] ); ?>
									<?php endif; ?>
								</td>
								<td data-label="<?php esc_attr_e( 'Requested', 'salsox' ); ?>"><?php echo esc_html( wp_date( get_option( 'date_format' ) . ' ' . get_option( 'time_format' ), (int) $row['at'] ) ); ?></td>
								<td data-label="<?php esc_attr_e( 'Status', 'salsox' ); ?>">
									<?php if ( $status ) : ?>
										<span class="salsox-pill salsox-pill--<?php echo esc_attr( strtolower( $status ) ); ?>"><?php echo esc_html( isset( $labels[ $status ] ) ? $labels[ $status ] : $status ); ?></span>
									<?php else : ?>
										<span class="salsox-muted">&mdash;</span>
									<?php endif; ?>
								</td>
							</tr>
						<?php endforeach; ?>
					</tbody>
				</table>
			<?php endif; ?>
		</section>
		<?php
	}
}
