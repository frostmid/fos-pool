var	_  = require ('lodash'),
	Promises = require ('vow'),

	mixin = require ('fos-mixin'),
	Resource = require ('./resource'),
	URIjs = require ('URIjs');


function isApp (urn) {
	return urn.indexOf ('/') === -1;
}


// Get design doc id by urn
function urn2ddocId (urn) {
	var index = urn.indexOf ('?');

	if (index == -1) {
		return urn;
	} else {
		return urn.substring (0, index);
	}
}


module.exports = function PoolResources (pool) {
	this.pool = pool;
	this.resources = [];
};

mixin (module.exports);

_.extend (module.exports.prototype, {
	pool: null, resources: null,

	get: function (client, id) {
		var db = this.pool.locate (client, id),
			key = db + ',' + id,
			resource = this.resources [key];

		if (!db) {
			var deferred = Promises.promise ();
			deferred.reject ({
				error: 'not_found',
				reason: 'missing_origin'
			});
			return deferred;
		}

		if (resource === undefined) {
			this.resources [key] = resource = new Resource (this, db, id);
		}

		resource.lock (client);

		return resource.ready ();
	},

	unset: function (resource) {
		var resources = this.resources,
			key = resource.origin + ',' + resource.id;

		if (resources && resources [key] !== undefined) {
			delete resources [key];
		}
	},

	resolve: function (origin, id) {
		var pool = this.pool;

		return Promises.when (pool.server.database (origin))
			.then (_.bind (function (database) {
				if (isApp (id)) {
					return this.resolveView (database, id);
				} else {
					return database.documents.get (id);	// <- TODO: Pass client to sign request
				}
			}, this));
	},

	resolveView: function (database, id) {
		var ddocId = urn2ddocId (id);

		return Promises.when (database.documents.get ('_design/' + ddocId))
			.then (function (designDoc) {
				var uri = URIjs (id),
					search = uri.search (true),
					type = _.first (_.keys (designDoc.get ('views'))),
					resolved = {
						design: ddocId,
						view: type,
						autoreduce: true,
						reduce: false,
						type: type
					},
					evaluate = require ('fos-evaluate');

				if (search.limit) {
					resolved.limit = search.limit;
				}

				if (search.skip) {
					resolved.skip = search.skip;
				}

				if (search.descending) {
					resolved.descending = search.descending;
				}

				if (search.include_docs == 'true') {
					resolved.include_docs = true;
				}

				if (designDoc.data.defaultResolve) {
					resolved = evaluate (designDoc.data.defaultResolve, {_: _}) (uri, resolved);
				}

				if (designDoc.data.resolve) {
					resolved = evaluate (designDoc.data.resolve, {_: _}) (uri, resolved);
				}

				resolved.options = search;

				return resolved;
			})
			.then (function (resolved) {
				return Promises.when (database.views.get (resolved.design, resolved.view))
					.then (function (view) {
						return view.get (resolved);
					});
			})
	}
});