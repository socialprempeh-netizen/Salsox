/**
 * Settings > Salsox in the browser: shows only the field for the chosen
 * kind of document, opens the Media Library to pick a PDF, copies the
 * shortcode, and asks before Disconnect. The settings themselves are saved
 * and checked by the server (Salsox_Settings::sanitize).
 */
( function () {
	'use strict';

	var strings = window.salsoxAdmin || {};

	function showSource( animate ) {
		var checked = document.querySelector( 'input[name="salsox_settings[source]"]:checked' );
		var value = checked ? checked.value : '';
		Array.prototype.forEach.call( document.querySelectorAll( '[data-salsox-source]' ), function ( row ) {
			var open = row.getAttribute( 'data-salsox-source' ) === value;
			row.hidden = ! open;
			row.classList.toggle( 'is-open', open && animate );
		} );
	}

	function pickPdf() {
		var button = document.querySelector( '[data-salsox-pick-pdf]' );
		if ( ! button || ! window.wp || ! window.wp.media ) {
			return;
		}
		var frame;
		button.addEventListener( 'click', function () {
			if ( ! frame ) {
				frame = window.wp.media( {
					title: strings.choosePdf,
					button: { text: strings.usePdf },
					library: { type: 'application/pdf' },
					multiple: false,
				} );
				frame.on( 'select', function () {
					var file = frame.state().get( 'selection' ).first().toJSON();
					document.getElementById( 'salsox-pdf' ).value = file.id;
					document.getElementById( 'salsox-pdf-name' ).textContent = file.title || file.filename;
				} );
			}
			frame.open();
		} );
	}

	function copy() {
		Array.prototype.forEach.call( document.querySelectorAll( '[data-salsox-copy]' ), function ( button ) {
			button.addEventListener( 'click', function () {
				var text = document.getElementById( button.getAttribute( 'data-salsox-copy' ) ).textContent;
				if ( navigator.clipboard ) {
					navigator.clipboard.writeText( text ).then( function () {
						var label = button.textContent;
						button.textContent = strings.copied;
						window.setTimeout( function () {
							button.textContent = label;
						}, 1500 );
					} );
				}
			} );
		} );
	}

	function confirmations() {
		Array.prototype.forEach.call( document.querySelectorAll( 'form[data-salsox-confirm]' ), function ( form ) {
			form.addEventListener( 'submit', function ( event ) {
				if ( ! window.confirm( form.getAttribute( 'data-salsox-confirm' ) ) ) {
					event.preventDefault();
				}
			} );
		} );
	}

	document.addEventListener( 'DOMContentLoaded', function () {
		showSource( false );
		Array.prototype.forEach.call( document.querySelectorAll( 'input[name="salsox_settings[source]"]' ), function ( radio ) {
			radio.addEventListener( 'change', function () {
				showSource( true );
			} );
		} );
		pickPdf();
		copy();
		confirmations();
	} );
} )();
