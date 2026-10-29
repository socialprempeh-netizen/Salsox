<?php
/**
 * The plugin's own REST routes, under /wp-json/salsox/v1:
 *
 *   POST request    a visitor's form submission (public; checks the form's
 *                   nonce, then everything Salsox_Form::submit() checks)
 *   GET  templates  the templates a form can send, for the block editor
 *                   (only people who can edit posts)
 *
 * The browser only ever talks to these routes on the site itself; the
 * routes talk to Salsox with the key kept on the server.
 *
 * @package Salsox
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Registers and answers the plugin's REST routes.
 */
class Salsox_Rest {

	/**
	 * Hooks route registration.
	 */
	public static function init() {
		add_action( 'rest_api_init', array( __CLASS__, 'routes' ) );
	}

	/**
	 * Registers the routes.
	 */
	public static function routes() {
		register_rest_route(
			'salsox/v1',
			'/request',
			array(
				'methods'             => 'POST',
				'callback'            => array( __CLASS__, 'request' ),
				// Anyone may submit a form; the nonce, the signed form settings and the limits guard it.
				'permission_callback' => '__return_true',
				'args'                => array(
					'name'    => array(
						'type'              => 'string',
						'sanitize_callback' => 'sanitize_text_field',
					),
					'email'   => array(
						'type'              => 'string',
						'sanitize_callback' => 'sanitize_email',
					),
					'website' => array(
						'type'              => 'string',
						'sanitize_callback' => 'sanitize_text_field',
					),
					'form'    => array(
						'type'              => 'string',
						'required'          => true,
						'sanitize_callback' => 'sanitize_text_field',
					),
					'nonce'   => array(
						'type'              => 'string',
						'required'          => true,
						'sanitize_callback' => 'sanitize_text_field',
					),
				),
			)
		);

		register_rest_route(
			'salsox/v1',
			'/templates',
			array(
				'methods'             => 'GET',
				'callback'            => array( __CLASS__, 'templates' ),
				'permission_callback' => static function () {
					return current_user_can( 'edit_posts' );
				},
			)
		);
	}

	/**
	 * A form submission.
	 *
	 * @param WP_REST_Request $request The request.
	 * @return WP_REST_Response|WP_Error
	 */
	public static function request( WP_REST_Request $request ) {
		if ( ! wp_verify_nonce( $request->get_param( 'nonce' ), Salsox_Form::NONCE ) ) {
			return new WP_Error( 'salsox_nonce', __( 'This page has been open too long. Reload it and try again.', 'salsox' ), array( 'status' => 403 ) );
		}
		$result = Salsox_Form::submit(
			array(
				'name'    => (string) $request->get_param( 'name' ),
				'email'   => (string) $request->get_param( 'email' ),
				'website' => (string) $request->get_param( 'website' ),
				'token'   => (string) $request->get_param( 'form' ),
			)
		);
		if ( is_wp_error( $result ) ) {
			return $result;
		}
		return rest_ensure_response( $result );
	}

	/**
	 * The templates a form can send.
	 *
	 * @param WP_REST_Request $request The request.
	 * @return WP_REST_Response|WP_Error
	 */
	public static function templates( WP_REST_Request $request ) {
		$result = self::sendable_templates( (bool) $request->get_param( 'fresh' ) );
		if ( is_wp_error( $result ) ) {
			return new WP_Error( $result->get_error_code(), $result->get_error_message(), array( 'status' => 502 ) );
		}
		return rest_ensure_response( $result );
	}

	/**
	 * The library and saved templates a visitor can be sent: those with
	 * exactly one role besides the sender's, as the form sends to one person.
	 *
	 * @param bool $fresh Skip the cache.
	 * @return array|WP_Error { library: [{ slug, title, category, variables }], saved: [{ id, name, template }] }
	 */
	public static function sendable_templates( $fresh = false ) {
		$all = Salsox_Api::templates( $fresh );
		if ( is_wp_error( $all ) ) {
			return $all;
		}
		$library = array();
		$fits    = array();
		foreach ( isset( $all['data'] ) && is_array( $all['data'] ) ? $all['data'] : array() as $t ) {
			$open = 0;
			foreach ( isset( $t['roles'] ) ? (array) $t['roles'] : array() as $role ) {
				if ( empty( $role['sender'] ) ) {
					++$open;
				}
			}
			if ( 1 !== $open || empty( $t['slug'] ) ) {
				continue;
			}
			$slug          = sanitize_key( $t['slug'] );
			$fits[ $slug ] = true;
			$library[]     = array(
				'slug'      => $slug,
				'title'     => sanitize_text_field( isset( $t['title'] ) ? $t['title'] : $slug ),
				'category'  => sanitize_text_field( isset( $t['category'] ) ? $t['category'] : '' ),
				'variables' => array_map( 'sanitize_text_field', isset( $t['variables'] ) ? (array) $t['variables'] : array() ),
			);
		}
		$saved = array();
		foreach ( isset( $all['saved'] ) && is_array( $all['saved'] ) ? $all['saved'] : array() as $s ) {
			$template = sanitize_key( isset( $s['template'] ) ? $s['template'] : '' );
			if ( empty( $s['id'] ) || ! isset( $fits[ $template ] ) ) {
				continue;
			}
			$saved[] = array(
				'id'       => preg_replace( '/[^A-Za-z0-9_-]/', '', (string) $s['id'] ),
				'name'     => sanitize_text_field( isset( $s['name'] ) ? $s['name'] : '' ),
				'template' => $template,
			);
		}
		return array(
			'library' => $library,
			'saved'   => $saved,
		);
	}
}
