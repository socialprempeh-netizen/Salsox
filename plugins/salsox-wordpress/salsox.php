<?php
/**
 * Plugin Name:       Salsox
 * Plugin URI:        https://salsox.com
 * Description:       Add a "Request a signature" form to any page. Visitors enter their name and email, and Salsox emails them your document to sign.
 * Version:           1.0.0
 * Requires at least: 6.3
 * Requires PHP:      7.4
 * Author:            Salsox
 * Author URI:        https://salsox.com
 * License:           GPL-2.0-or-later
 * License URI:       https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain:       salsox
 *
 * @package Salsox
 */

/*
 * Salsox for WordPress: the plugin's entry point. It defines the constants
 * every other file reads and loads the four parts:
 *
 *   includes/class-salsox-api.php       the only code that calls out, to the Salsox public API
 *   includes/class-salsox-settings.php  Settings > Salsox: the API key, the connection test, defaults
 *   includes/class-salsox-form.php      the form a visitor sees (shortcode and block) and its submission
 *   includes/class-salsox-rest.php      the plugin's own REST routes, for the form and the block editor
 *
 * Every call to Salsox is made from the server with the site owner's API key;
 * the key never reaches a visitor's browser.
 *
 * Salsox for WordPress is free software: you can redistribute it and/or
 * modify it under the terms of the GNU General Public License as published
 * by the Free Software Foundation, either version 2 of the License, or (at
 * your option) any later version. It is distributed in the hope that it will
 * be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General
 * Public License for more details.
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

define( 'SALSOX_VERSION', '1.0.0' );
define( 'SALSOX_FILE', __FILE__ );
define( 'SALSOX_DIR', plugin_dir_path( __FILE__ ) );
define( 'SALSOX_URL', plugin_dir_url( __FILE__ ) );

/*
 * Where Salsox is. Every outgoing request goes to this origin and nowhere
 * else. A developer testing against their own Salsox server can define it
 * first, in wp-config.php.
 */
if ( ! defined( 'SALSOX_SERVER' ) ) {
	define( 'SALSOX_SERVER', 'https://salsox.com' );
}

require_once SALSOX_DIR . 'includes/class-salsox-api.php';
require_once SALSOX_DIR . 'includes/class-salsox-settings.php';
require_once SALSOX_DIR . 'includes/class-salsox-form.php';
require_once SALSOX_DIR . 'includes/class-salsox-rest.php';

Salsox_Settings::init();
Salsox_Form::init();
Salsox_Rest::init();

/** A "Settings" link beside Deactivate on the Plugins screen. */
add_filter(
	'plugin_action_links_' . plugin_basename( __FILE__ ),
	static function ( $links ) {
		$url = admin_url( 'options-general.php?page=salsox' );
		array_unshift( $links, '<a href="' . esc_url( $url ) . '">' . esc_html__( 'Settings', 'salsox' ) . '</a>' );
		return $links;
	}
);
