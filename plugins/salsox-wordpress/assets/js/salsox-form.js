/**
 * The "Request a signature" form in the visitor's browser. Without this
 * script the form still works: it posts to admin-post.php and the page
 * reloads with the outcome. With it, the form posts to the plugin's REST
 * route (/wp-json/salsox/v1/request), checks the two fields first, shows the
 * button as busy, and swaps in the confirmation without a reload.
 *
 * The browser decides nothing: the server checks the nonce, the form's
 * signed settings, the fields and the limits again, every time.
 */
( function () {
	'use strict';

	var config = window.salsoxForm || {};
	var EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

	function fail( form, message, field ) {
		var box = form.querySelector( '.salsox-sign__error' );
		box.textContent = message;
		box.hidden = false;
		if ( field ) {
			field.setAttribute( 'aria-invalid', 'true' );
			field.focus();
		}
	}

	function clear( form ) {
		form.querySelector( '.salsox-sign__error' ).hidden = true;
		Array.prototype.forEach.call( form.querySelectorAll( '[aria-invalid]' ), function ( f ) {
			f.removeAttribute( 'aria-invalid' );
		} );
	}

	function done( root, email, title ) {
		var form = root.querySelector( '[data-salsox-panel="form"]' );
		var panel = root.querySelector( '[data-salsox-panel="done"]' );
		var text = panel.querySelector( '[data-salsox-done-text]' );
		// Built from text nodes, never markup: the address is what the visitor typed.
		text.textContent = '';
		var before = title ? ( config.doneTitled || '' ).replace( '%s', title ) : config.doneUntitled || '';
		text.appendChild( document.createTextNode( before + ' ' ) );
		var strong = document.createElement( 'strong' );
		strong.textContent = email;
		text.appendChild( strong );
		text.appendChild( document.createTextNode( '. ' + ( config.doneAfter || '' ) ) );
		form.hidden = true;
		panel.hidden = false;
		panel.classList.add( 'is-entering' );
		panel.focus();
	}

	function bind( root ) {
		var form = root.querySelector( 'form.salsox-sign__form' );
		if ( ! form || ! config.endpoint || ! window.fetch ) {
			return;
		}
		var button = form.querySelector( '.salsox-sign__button' );
		var label = button.textContent;
		var name = form.querySelector( 'input[name="salsox_name"]' );
		var email = form.querySelector( 'input[name="salsox_email"]' );

		form.addEventListener( 'submit', function ( event ) {
			event.preventDefault();
			if ( button.getAttribute( 'aria-busy' ) === 'true' ) {
				return;
			}
			clear( form );
			if ( ! name.value.trim() ) {
				return fail( form, config.needName, name );
			}
			if ( ! EMAIL.test( email.value.trim() ) ) {
				return fail( form, config.needEmail, email );
			}

			button.setAttribute( 'aria-busy', 'true' );
			button.textContent = config.sending || label;

			window
				.fetch( config.endpoint, {
					method: 'POST',
					credentials: 'same-origin',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify( {
						name: name.value.trim(),
						email: email.value.trim(),
						website: form.querySelector( 'input[name="salsox_website"]' ).value,
						form: form.querySelector( 'input[name="salsox_form"]' ).value,
						nonce: form.querySelector( 'input[name="salsox_nonce"]' ).value,
					} ),
				} )
				.then( function ( response ) {
					return response.json().then( function ( body ) {
						return { ok: response.ok, body: body };
					} );
				} )
				.then( function ( result ) {
					if ( result.ok ) {
						done( root, email.value.trim(), result.body.title || '' );
						form.reset();
					} else {
						fail( form, ( result.body && result.body.message ) || config.failed );
					}
				} )
				.catch( function () {
					fail( form, config.failed );
				} )
				.then( function () {
					button.removeAttribute( 'aria-busy' );
					button.textContent = label;
				} );
		} );

		var again = root.querySelector( '.salsox-sign__again' );
		again.addEventListener( 'click', function () {
			var panel = root.querySelector( '[data-salsox-panel="done"]' );
			panel.hidden = true;
			panel.classList.remove( 'is-entering' );
			root.querySelector( '[data-salsox-panel="form"]' ).hidden = false;
			form.hidden = false;
			name.focus();
		} );
	}

	function start() {
		Array.prototype.forEach.call( document.querySelectorAll( '.salsox-sign' ), bind );
	}

	if ( document.readyState === 'loading' ) {
		document.addEventListener( 'DOMContentLoaded', start );
	} else {
		start();
	}
} )();
