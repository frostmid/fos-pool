var vows = require ('vows'),
	assert = require ('assert'),

	Q = require ('q'),
	_  = require ('lodash'),
	Pool = require ('../index.js');

function wrap4promise (callback, ctx) {
	return {
		success: function (result) {
			callback.call (ctx, null, result);
		},

		error: function (error) {
			callback.apply (ctx, error);
		}
	};
}

var signature = {
	auth: {
		username: 'lyxsus@gmail.com',
		password: 'letmein'
	}
};

var settings = {
	server: {
		host: '89.179.119.16',
		
		auth: signature.auth,

		notifications: {
			port: 5983
		}
	}
};


vows.describe ('fos-pool/general').addBatch ({
	'pool': {
		topic: function () {
			var callback = wrap4promise (this.callback, this),
				pool = new Pool (settings);

			Q.when (pool.ready ())
				.then (callback.success)
				.fail (callback.error)
				.done ();
		},

		'ready': function (pool) {
			assert.isTrue (pool.isReady);
		},

		'client': {
			topic: function (pool) {
				var callback = wrap4promise (this.callback, this),
					client = pool.client (signature);

				Q.when (client)
					.then (callback.success)
					.fail (callback.error)
					.done ();
			},

			'not null': function (client) {
				assert.isNotNull (client);
			},

			'ready': function (client) {
				assert.isTrue (client.isReady);
			},

			'correct': function (client) {
				assert.equal (client.user.get ('name'), 'lyxsus@gmail.com');
			},

			'resources': {
				'document': {
					topic: function (client) {
						var callback = wrap4promise (this.callback, this),
							resource = client.resources.get ('urn:debug:test/example');

						Q.when (resource)
							.then (callback.success)
							.fail (callback.error)
							.done ();
					},

					'not null': function (resource) {
						assert.isNotNull (resource);
					},

					'ready': function (resource) {
						assert.isTrue (resource.isReady);
					},

					'correct': function (resource) {
						assert.equal (resource.get ('_id'), 'urn:debug:test/example');
						assert.isNotNull (resource.get ('_rev'));
					},

					'update': {
						topic: function (resource) {
							var callback = wrap4promise (this.callback, this),
								newTitle = '#' + Date.now ();

							Q.when (resource.save ({
								title: newTitle
							}, signature))
								.then (callback.success)
								.fail (callback.error)
								.done ();
						},

						'no errors': function (resource) {
							// console.log ('#', resource);
							assert.isObject (resource);
							assert.isNull (resource.error);
						},

						'ready': function (resource) {
							assert.isObject (resource);
							assert.isTrue (resource.isReady);
						}
					}
				},

				'missing document': {
					topic: function (client) {
						var callback = wrap4promise (this.callback, this),
							resource = client.resources.get ('urn:debug:test/not-found');

						Q.when (resource)
							.fail (callback.success)
							.done ();
					},

					'not found': function (error) {
						assert.equal (error.error, 'not_found');
					}
				},

				'collection': {
					topic: function (client) {
						var callback = wrap4promise (this.callback, this),
							resource = client.resources.get ('urn:debug:test?limit=1');

						Q.when (resource)
							.then (callback.success)
							.fail (callback.error)
							.done ();
					},

					'not null': function (resource) {
						assert.isNotNull (resource);
					},

					'ready': function (resource) {
						assert.isTrue (resource.isReady);
					},

					'has rows': function (resource) {
						var rows = resource.get ('rows')
						assert.isArray (rows);
						assert.equal (rows.length, 1)
					},

					'correct id': function (resource) {
						assert.equal (resource.get ('_id'), 'urn:debug:test?limit=1');
					},

					'has _rev': function (resource) {
						assert.isTrue (/^\d+\-update_seq$/.test (resource.get ('_rev')));
					},

					'has type': function (resource) {
						assert.isTrue (/^urn:/.test (resource.get ('type')));
					},

					'has summary': function (resource) {
						var summary = resource.get ('summary');
						
						assert.isNotNull (summary);
						assert.isObject (summary);
					}
				},

				'missing collection': {
					topic: function (client) {
						var callback = wrap4promise (this.callback, this),
							resource = client.resources.get ('urn:app-not-found');

						Q.when (resource)
							.fail (callback.success)
							.done ();
					},

					'not found': function (error) {
						assert.equal (error.error, 'not_found');
					}
				},

				'fulltext search': {
					topic: function (client) {
						var callback = wrap4promise (this.callback, this),
							resource = client.resources.get ('urn:debug:test?search=test&skip=0');

						Q.when (resource)
							.then (callback.success, callback.success)
							.done ();
					},

					'no error': function (resource) {
						assert.isFalse (resource instanceof Error);
						assert.isNull (resource.error);
					},

					'correct': function (resource) {
						assert.isString (resource.get ('_id'));
						assert.isString (resource.get ('_rev'));
					}
				}
			},

			'release': {
				topic: function (client) {
					var callback = _.bind (this.callback, this);

					_.delay (function () {
						client.disposeDelay = 0;
						client.release (true);

						_.delay (function () {
							callback (null, client);
						}, 500);
					}, 1500);
				},

				released: function (client) {
					assert.isTrue (client.disposing);
				}
			}
		},

		'nobody': {
			topic: function (pool) {
				var callback = wrap4promise (this.callback, this),
					client = pool.client ();

				Q.when (client)
					.then (callback.success)
					.fail (callback.error)
					.done ();
			},

			'not null': function (client) {
				assert.isNotNull (client);
			},

			'ready': function (client) {
				assert.isTrue (client.isReady);
			},

			'correct': function (client) {
				assert.equal (client.user.get ('name'), 'nobody');
			},

			'release': {
				topic: function (client) {
					var callback = _.bind (this.callback, this);

					_.delay (function () {
						client.disposeDelay = 0;
						client.release (true);

						_.delay (function () {
							callback (null, client);
						}, 100);
					}, 100);
				},

				released: function (client) {
					assert.isTrue (client.disposing);
				}
			}
		}
	}
}).export (module);;