var _ = require ('lodash'),
	Q = require ('q'),

	Resource = require ('./resource'),
	mixin = require ('fos-mixin');

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

var NotFound = {
	error: 'app_not_found',
	reason: 'missing'
};


module.exports = function (client) {
	this.id = 'resources ' + client.id;
	this.client = client;
	this.models = {};
};

mixin (module.exports);

_.extend (module.exports.prototype, {
	get: function (id) {
		if (!id) return null;

		if (!this.has (id)) {
			this.models [id] = (new Resource (this, id)).lock (this);
		}

		return this.models [id].ready ();
	},

	create: function (data) {
		var pool = this.client.pool,
			self = this,
			app;

		return Q.when (this.locateType (data.type))
			.then (function () {
				app = arguments [0];
				return self.selectDb (pool.getAppDbs (app));
			})
			.then (function (db) {
				return pool.server.database (db);
			})
			.then (function (database) {
				return database.documents.create (app, data);
			})
			.then (function (document) {
				return self.get (document.id);
			})
	},

	has: function (id) {
		return this.models [id] != undefined;
	},

	unset: function (id) {
		if (this.models)
		delete this.models [id];
	},

	locate: function (id) {
		var pool = this.client.pool,
			app, dbs;

		if (app = pool.findApp (id)) {
			return this.selectDb (pool.getAppDbs (app));
		} else {
			var deferred = Q.defer ();
			deferred.reject (NotFound);
			return deferred.promise;
		}
	},

	locateType: function (type) {
		var pool = this.client.pool,
			app, dbs;

		if (app = pool.findAppByType (type)) {
			return app;
		} else {
			var deferred = Q.defer ();
			deferred.reject (NotFound);
			return deferred.promise;
		}
	},

	resolve: function (origin, id) {
		var pool = this.client.pool;

		return Q.when (pool.server.database (origin))
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

		return Q.when (database.documents.get ('_design/' + ddocId))
			.then (function (designDoc) {
				var uri = require ('URIjs') (id),
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

				if (designDoc.data.defaultResolve) {
					resolved = evaluate (designDoc.data.defaultResolve, {_: _}) (uri, resolved);
				}

				if (designDoc.data.resolve) {
					resolved = evaluate (designDoc.data.resolve, {_: _}) (uri, resolved);
				}

				return resolved;
			})
			.then (function (resolved) {
				return Q.when (database.views.get (resolved.design, resolved.view))
					.then (function (view) {
						return view.get (resolved);
					});
			})
	},

	selectDb: function (dbs) {
		if (!dbs.length) return null;

		var dbs = dbs.slice (0),
			db = dbs.shift ();

		if (/^roles\//.test (db)) {
			db = this.client.user.get ('database');
		}

		return this.checkDbSecurity (db)
			.then (_.bind (function (allowed) {
				return db || this.selectDb (dbs);
			}, this));
	},

	checkDbSecurity: function (name) {
		return Q.when (this.client.pool.server.database (name))
			.then (function (database) {
				return database.documents.get ('_security');
			})
			.then (function (security) {
				return security.data;
			})
			.then (_.bind (this.checkPermissions, this));
	},

	// Check, if client has access to database using couchdb security document
	checkPermissions: function (security) {
		if (!security) return true;

		var readers = security.readers,
			admins = security.admins,
			client = this.client;

		var name = client.name,
			roles = client.roles;

		// Empty readers fields means everybody is a reader
		if (!readers || !readers.names || readers.names.length == 0) {
			return true;
		}

		// Check allowed users
		if ((admins.names.indexOf (name) !== -1) ||
			(readers.names.indexOf (name) !== -1)) {
			return true;
		}

		// Check roles
		return _.any (roles, function (role) {
			return ((readers.roles.indexOf (role) !== -1) ||
				(admins.roles.indexOf (role) !== -1));
		});
	},

	dispose: function () {
		var release = _.bind (function (resource) {
			return resource.release (this, true);
		}, this);

		return Q.all (_.map (this.models, release))
			.then (_.bind (this.cleanup, this));
	},

	cleanup: function () {
		this.client = null;
		this.models = null;
	}
});
