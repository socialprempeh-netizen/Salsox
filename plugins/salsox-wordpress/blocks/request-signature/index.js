/**
 * The "Request a signature" block, in the editor. Written against the
 * WordPress globals (wp.blocks, wp.element, …) with no build step, so the
 * file shipped is the file you read.
 *
 * The block is dynamic: the page shows what Salsox_Form::render() prints, and
 * the editor shows the same thing through ServerSideRender. The sidebar picks
 * the document (the default from Settings > Salsox, a Salsox template, a
 * saved template or a PDF from the Media Library) and the wording. Templates
 * come from the plugin's own route, /wp-json/salsox/v1/templates, which asks
 * Salsox with the key kept on the server.
 */
( function ( wp ) {
	'use strict';

	var el = wp.element.createElement;
	var useState = wp.element.useState;
	var useEffect = wp.element.useEffect;
	var __ = wp.i18n.__;
	var be = wp.blockEditor;
	var c = wp.components;
	var ServerSideRender = wp.serverSideRender;

	/* The plain teal "S", square, as the block's icon. */
	var icon = el(
		'svg',
		{ viewBox: '0 0 64 64', xmlns: 'http://www.w3.org/2000/svg' },
		el( 'rect', { width: 64, height: 64, fill: '#0f766e' } ),
		el( 'path', {
			fill: '#fff',
			d: 'M32.6 51.5c-6.3 0-11.7-2-15.4-5.2l3.9-6.2c3.3 2.7 7.6 4.4 11.6 4.4 3.6 0 5.6-1.3 5.6-3.4 0-2.4-2.4-3.2-7-4.3-6.6-1.6-12.6-3.7-12.6-11 0-6.5 5.3-11.3 13.6-11.3 5.4 0 10 1.6 13.4 4.3l-3.6 6.3c-3-2.2-6.7-3.6-10-3.6-3.1 0-4.8 1.3-4.8 3.1 0 2.3 2.6 3.1 7.2 4.2 6.8 1.6 12.4 4 12.4 10.9 0 7-5.6 11.8-14.3 11.8z',
		} )
	);

	/** The templates a form can send, loaded once per editor session. */
	var loaded = null;
	function loadTemplates() {
		if ( ! loaded ) {
			loaded = wp.apiFetch( { path: '/salsox/v1/templates' } ).catch( function ( error ) {
				loaded = null;
				throw error;
			} );
		}
		return loaded;
	}

	function Edit( props ) {
		var a = props.attributes;
		var set = props.setAttributes;
		var state = useState( { library: [], saved: [], error: '', ready: false } );
		var list = state[ 0 ];
		var setList = state[ 1 ];

		useEffect( function () {
			var live = true;
			loadTemplates()
				.then( function ( data ) {
					if ( live ) {
						setList( { library: data.library || [], saved: data.saved || [], error: '', ready: true } );
					}
				} )
				.catch( function ( error ) {
					if ( live ) {
						setList( { library: [], saved: [], error: ( error && error.message ) || __( 'Templates could not be loaded.', 'salsox' ), ready: true } );
					}
				} );
			return function () {
				live = false;
			};
		}, [] );

		var chosen = list.library.filter( function ( t ) {
			return t.slug === a.template;
		} )[ 0 ];

		var documentPanel = el(
			c.PanelBody,
			{ title: __( 'Document', 'salsox' ), initialOpen: true },
			el( c.SelectControl, {
				label: __( 'Send', 'salsox' ),
				value: a.source,
				options: [
					{ value: 'default', label: __( 'The default from Settings > Salsox', 'salsox' ) },
					{ value: 'template', label: __( 'A Salsox template', 'salsox' ) },
					{ value: 'saved', label: __( 'One of my saved templates', 'salsox' ) },
					{ value: 'pdf', label: __( 'A PDF from the Media Library', 'salsox' ) },
				],
				onChange: function ( v ) {
					set( { source: v } );
				},
				__nextHasNoMarginBottom: true,
			} ),
			list.error ? el( c.Notice, { status: 'warning', isDismissible: false }, list.error ) : null,
			'template' === a.source
				? el( c.SelectControl, {
						label: __( 'Template', 'salsox' ),
						help: __( 'Templates with one signer besides you.', 'salsox' ),
						value: a.template,
						disabled: ! list.ready,
						options: [ { value: '', label: list.ready ? __( 'Choose a template', 'salsox' ) : __( 'Loading…', 'salsox' ) } ].concat(
							list.library.map( function ( t ) {
								return { value: t.slug, label: t.title };
							} )
						),
						onChange: function ( v ) {
							set( { template: v } );
						},
						__nextHasNoMarginBottom: true,
				  } )
				: null,
			'saved' === a.source
				? el( c.SelectControl, {
						label: __( 'Saved template', 'salsox' ),
						value: a.savedTemplate,
						disabled: ! list.ready,
						options: [ { value: '', label: list.ready ? __( 'Choose a saved template', 'salsox' ) : __( 'Loading…', 'salsox' ) } ].concat(
							list.saved.map( function ( s ) {
								return { value: s.id, label: s.name };
							} )
						),
						onChange: function ( v ) {
							set( { savedTemplate: v } );
						},
						__nextHasNoMarginBottom: true,
				  } )
				: null,
			'pdf' === a.source
				? el(
						be.MediaUploadCheck,
						null,
						el( be.MediaUpload, {
							allowedTypes: [ 'application/pdf' ],
							value: a.pdfId,
							onSelect: function ( media ) {
								set( { pdfId: media.id, pdfName: media.title || media.filename || '' } );
							},
							render: function ( o ) {
								return el(
									'div',
									{ className: 'salsox-block-pdf' },
									el( 'p', null, a.pdfId ? a.pdfName || '#' + a.pdfId : __( 'No PDF chosen', 'salsox' ) ),
									el( c.Button, { variant: 'secondary', onClick: o.open }, a.pdfId ? __( 'Replace PDF', 'salsox' ) : __( 'Choose PDF', 'salsox' ) ),
									el( 'p', { className: 'components-base-control__help' }, __( 'Up to 4 MB. Your site must be public and use HTTPS so Salsox can download it.', 'salsox' ) )
								);
							},
						} )
				  )
				: null,
			'template' === a.source || 'saved' === a.source
				? el( c.TextareaControl, {
						label: __( 'Template values', 'salsox' ),
						help:
							chosen && chosen.variables.length
								? __( 'One per line, as Name=Value. {name} and {email} are replaced with what the visitor enters. This template has:', 'salsox' ) + ' ' + chosen.variables.join( ', ' )
								: __( 'One per line, as Name=Value. {name} and {email} are replaced with what the visitor enters.', 'salsox' ),
						value: a.values,
						onChange: function ( v ) {
							set( { values: v } );
						},
						__nextHasNoMarginBottom: true,
				  } )
				: null,
			el( c.TextControl, {
				label: __( 'Document title', 'salsox' ),
				help: __( 'Leave blank to use the template or file name.', 'salsox' ),
				value: a.documentTitle,
				onChange: function ( v ) {
					set( { documentTitle: v } );
				},
				__nextHasNoMarginBottom: true,
			} ),
			el( c.TextareaControl, {
				label: __( 'Message in the email', 'salsox' ),
				value: a.message,
				onChange: function ( v ) {
					set( { message: v } );
				},
				__nextHasNoMarginBottom: true,
			} )
		);

		var wordingPanel = el(
			c.PanelBody,
			{ title: __( 'Wording', 'salsox' ), initialOpen: false },
			el( c.TextControl, {
				label: __( 'Heading', 'salsox' ),
				placeholder: __( 'Request a signature', 'salsox' ),
				value: a.heading,
				onChange: function ( v ) {
					set( { heading: v } );
				},
				__nextHasNoMarginBottom: true,
			} ),
			el( c.TextareaControl, {
				label: __( 'Description', 'salsox' ),
				value: a.description,
				onChange: function ( v ) {
					set( { description: v } );
				},
				__nextHasNoMarginBottom: true,
			} ),
			el( c.TextControl, {
				label: __( 'Button', 'salsox' ),
				placeholder: __( 'Email me the document', 'salsox' ),
				value: a.buttonLabel,
				onChange: function ( v ) {
					set( { buttonLabel: v } );
				},
				__nextHasNoMarginBottom: true,
			} )
		);

		return el(
			'div',
			be.useBlockProps(),
			el( be.InspectorControls, null, documentPanel, wordingPanel ),
			el(
				c.Disabled,
				null,
				el( ServerSideRender, { block: 'salsox/request-signature', attributes: a } )
			)
		);
	}

	wp.blocks.registerBlockType( 'salsox/request-signature', {
		icon: icon,
		edit: Edit,
		save: function () {
			return null;
		},
	} );
} )( window.wp );
