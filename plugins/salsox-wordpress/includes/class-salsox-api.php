<?php
/**
 * The Salsox public API client: the only code in the plugin that makes an
 * outgoing request. It calls the routes Salsox documents for integrations,
 * and nothing else:
 *
 *   GET  /api/v1/me             whose key this is, and the plan (the connection test)
 *   GET  /api/v1/templates      the library and saved templates a form can send
 *   POST /api/v1/documents      create and send a document to a visitor
 *   GET  /api/v1/documents      the account's documents, for the request log's statuses
 *   DELETE /api/v1/keys/current revoke the key, when the owner disconnects
 *
 * Errors come back from Salsox as { "error": { "code", "message" } } and are
 * returned here as WP_Error with that code and message, so callers can show
 * the server's own sentence.
 *
 * @package Salsox
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Calls the Salsox public API with the saved API key.
 */
class Salsox_Api {

	/** Option the API key is stored in. */
	const KEY_OPTION = 'salsox_api_key';

	/** Transient the template list is cached in, so the block editor does not call Salsox on every keystroke. */
	const TEMPLATES_CACHE = 'salsox_templates';

	/**
	 * The saved API key, or an empty string.
	 *
	 * @return string
	 */
	public static function key() {
		$key = get_option( self::KEY_OPTION, '' );
		return is_string( $key ) ? $key : '';
	}

	/**
	 * Whether a key is saved. Says nothing about whether Salsox accepts it.
	 *
	 * @return bool
	 */
	public static function has_key() {
		return '' !== self::key();
	}

	/**
	 * One request to the API.
	 *
	 * @param string     $method HTTP method.
	 * @param string     $path   Path under /api/v1, starting with a slash.
	 * @param array|null $body   JSON body, or null.
	 * @param string     $key    API key to use instead of the saved one (the connection test of a key not yet saved).
	 * @return array|WP_Error Decoded JSON (an empty array for 204), or the error.
	 */
	public static function request( $method, $path, $body = null, $key = null ) {
		$key = null === $key ? self::key() : $key;
		if ( '' === $key ) {
			return new WP_Error( 'salsox_no_key', __( 'Add your Salsox API key in Settings > Salsox first.', 'salsox' ) );
		}

		$args = array(
			'method'  => $method,
			'timeout' => 'POST' === $method ? 30 : 15,
			'headers' => array(
				'Authorization' => 'Bearer ' . $key,
				'Accept'        => 'application/json',
				'User-Agent'    => 'Salsox-WordPress/' . SALSOX_VERSION . '; ' . home_url( '/' ),
			),
		);
		if ( null !== $body ) {
			$args['headers']['Content-Type'] = 'application/json';
			$args['body']                    = wp_json_encode( $body );
		}

		$response = wp_remote_request( untrailingslashit( SALSOX_SERVER ) . '/api/v1' . $path, $args );
		if ( is_wp_error( $response ) ) {
			return new WP_Error( 'salsox_unreachable', __( 'Salsox could not be reached. Check that this server can make outgoing HTTPS requests, then try again.', 'salsox' ) );
		}

		$status = (int) wp_remote_retrieve_response_code( $response );
		if ( 204 === $status ) {
			return array();
		}
		$data = json_decode( wp_remote_retrieve_body( $response ), true );

		if ( $status >= 200 && $status < 300 && is_array( $data ) ) {
			return $data;
		}
		if ( is_array( $data ) && isset( $data['error']['code'], $data['error']['message'] ) ) {
			return new WP_Error( 'salsox_' . sanitize_key( $data['error']['code'] ), sanitize_text_field( $data['error']['message'] ), array( 'status' => $status ) );
		}
		/* translators: %d: HTTP status code. */
		return new WP_Error( 'salsox_http', sprintf( __( 'Salsox answered with an unexpected response (HTTP %d).', 'salsox' ), $status ), array( 'status' => $status ) );
	}

	/**
	 * The account the key belongs to: id, email, name and plan.
	 *
	 * @param string|null $key A key to test instead of the saved one.
	 * @return array|WP_Error
	 */
	public static function me( $key = null ) {
		return self::request( 'GET', '/me', null, $key );
	}

	/**
	 * The templates a form can send, cached for ten minutes.
	 *
	 * @param bool $fresh Skip the cache.
	 * @return array|WP_Error { data: library templates, saved: saved templates }
	 */
	public static function templates( $fresh = false ) {
		if ( ! $fresh ) {
			$cached = get_transient( self::TEMPLATES_CACHE );
			if ( is_array( $cached ) ) {
				return $cached;
			}
		}
		$result = self::request( 'GET', '/templates' );
		if ( ! is_wp_error( $result ) ) {
			set_transient( self::TEMPLATES_CACHE, $result, 10 * MINUTE_IN_SECONDS );
		}
		return $result;
	}

	/**
	 * Creates and sends a document.
	 *
	 * @param array $body The POST /api/v1/documents body.
	 * @return array|WP_Error The document, with `undelivered` and `not_emailed` counts.
	 */
	public static function send_document( array $body ) {
		return self::request( 'POST', '/documents', $body );
	}

	/**
	 * The account's latest documents, newest first.
	 *
	 * @param int $limit Up to 100.
	 * @return array|WP_Error { data, next_cursor }
	 */
	public static function documents( $limit = 100 ) {
		return self::request( 'GET', '/documents?limit=' . absint( $limit ) );
	}

	/**
	 * Revokes the saved key at Salsox.
	 *
	 * @return array|WP_Error
	 */
	public static function revoke_key() {
		return self::request( 'DELETE', '/keys/current' );
	}
}
