var _ = require ('lodash'),
	Promises = require ('vow'),
	evaluate = require ('fos-evaluate'),
	LRU = require ('lru-cache');

function promiseRequire (modules, timeout) {
	var promise = Promises.promise (),
		defaultTimeout = 45 * 1000,
		timeoutId;

	require (modules, function () {
		clearTimeout (timeoutId);
		promise.fulfill (arguments);
	});

	timeoutId = setTimeout (function () {
		promise.reject ('timeout');
	}, timeout || defaultTimeout);

	return promise;
}

function times (s, t) {
	var r = ''; while (t--) r += s; return r;
}

var cache = LRU ({
	max: 1000
});

var globalSeq = 1;

function getSource (trigger) {
	return '//@ sourceURL=' + trigger.id + '/trigger\r\n' + trigger.get ('trigger');
}

function exec (source, event, context, cacheKey) {
	var defined, scope = {
		define: function () {
			if (arguments.length > 1) {
				var factory = arguments [arguments.length - 1],
					dependencies = arguments [arguments.length - 2];

				defined = promiseRequire (dependencies)
					.then (function (modules) {
						return factory.apply (null, modules);
					});
			} else {
				defined = arguments [0].call (null);
			}
		},

		globalStorage: context.storage
	};

	var cached = cache.get (cacheKey);

	return Promises.when (cached || evaluate (source, scope, cacheKey))
		.then (function (compiled) {
			if (cached) return cached;
			return defined
				? Promises.when (defined)
				: compiled;
		})

		.then (function (compiled) {
			if (!cached) {
				cache.set (cacheKey, compiled);
			}
			

			return compiled.call (context, event);
		});
}

module.exports = function (storage) {
	function retrigger (id, event, seq, level) {
		var urn = 'urn:fos:trigger?limit=1000&after=' + encodeURIComponent (id);

		return Promises.when (storage.get (urn))
			.then (function (triggers) {
				return Promises.all (
					_.map (triggers.get ('rows'), function (row) {
						return trigger (row.id, event, seq, level)
							.fail (function (error) {
								if (error.message) {
									console.error ('Failed to execute subtrigger', row.id, error.message, error.stack);
								} else {
									console.error ('Failed to execute subtrigger', row.id, error);
								}
							});
					})
				);
			})

			.fail (function (error) {
				console.error ('Failed to execute subtriggers', id, error);
			})

			.then (function () {
				return event || null;
			});
	}

	function trigger (id, event, seq, level) {
		seq = seq || globalSeq++;
		level = level || 0;

		var title;
		return Promises.when (storage.get (id))
			.then (function (doc) {
				title = doc.get ('title');

				// console.log ('[' + seq + '] ' + times ('\t', level) + '? ' + title);

				return doc.has ('trigger')
					? exec (getSource (doc), event, {
						next: function (newEvent) {
							return retrigger (id, (newEvent || event), seq, level + 1);
						},
						storage: storage,
						trigger: doc
					}, (doc.id + doc.get ('_rev')))
					: event;
			})
			
			.then (function (result) {
				if (result !== false) {
					console.log ('[' + seq + '] ' + times ('\t', level) + '* ' + title);
				}

				return result;
			})

			.fail (function (error) {
				if (error.message) {
					console.error ('Failed to execute trigger', id, error.message, error.stack);
				} else {
					console.error ('Failed to execute trigger', id, error);
				}
			});
	}

	return trigger;
}