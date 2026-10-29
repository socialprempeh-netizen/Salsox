<?php
/**
 * Runs when the plugin is deleted from the Plugins screen: removes
 * everything it stored, so nothing is left behind. The settings, the API
 * key, the request log and the cached account and templates go; the
 * per-visitor limit counters are transients and expire within a day on
 * their own, and are removed here too where they are kept in the database.
 *
 * The key is only forgotten here, not revoked at Salsox: an uninstall makes
 * no outgoing request. Disconnect on Settings > Salsox revokes it, and the
 * Developers page in Salsox lists it until then.
 *
 * @package Salsox
 */

if ( ! defined( 'WP_UNINSTALL_PLUGIN' ) ) {
	exit;
}

/**
 * Removes one site's data.
 */
function salsox_uninstall_site() {
	global $wpdb;

	delete_option( 'salsox_api_key' );
	delete_option( 'salsox_settings' );
	delete_option( 'salsox_log' );
	delete_transient( 'salsox_account' );
	delete_transient( 'salsox_templates' );

	// The limit counters have generated names (salsox_v_…, salsox_e_…, salsox_day_…).
	// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching -- One-off cleanup of this plugin's own rows on uninstall.
	$wpdb->query(
		$wpdb->prepare(
			"DELETE FROM {$wpdb->options} WHERE option_name LIKE %s OR option_name LIKE %s",
			$wpdb->esc_like( '_transient_salsox_' ) . '%',
			$wpdb->esc_like( '_transient_timeout_salsox_' ) . '%'
		)
	);
}

if ( is_multisite() ) {
	foreach ( get_sites( array( 'fields' => 'ids' ) ) as $salsox_site_id ) {
		switch_to_blog( $salsox_site_id );
		salsox_uninstall_site();
		restore_current_blog();
	}
} else {
	salsox_uninstall_site();
}
