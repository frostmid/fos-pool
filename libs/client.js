var _ = require ('lodash'),
	Q = require ('q'),

	mixin = require ('fos-mixin'),
	request = require ('fos-request');


module.exports = function Client (pool, settings) {
	this.id = 'client #' + Date.now ();

	this.pool = pool;
	this.settings = settings || {};
	
	// TODO: Remove old api callbacks
	this.resources = {
		get: _.bind (this.get, this),
		create: _.bind (this.create, this)
	};

	this.cache = [];
};

mixin (module.exports);

function getUserId (info) {
	return 'org.couchdb.user:' + (info.name || 'nobody');
}

_.extend (module.exports.prototype, {
	tag: 'client',

	
	user: null,

	name: null,
	roles: null,
	cache: null,

	fetch: function () {
		return this.fetchSession ()
			.then (getUserId)
			.then (_.bind (this.fetchUser, this))
	},

	fetchSession: function () {
		return request (
			this.sign ({
				url: this.pool.server.url + '_session',
				accept: 'application/json'
			})
		)
			.then (function (resp) {
				if (!resp.ok) throw new Error (resp);
				return resp.userCtx;
			});
	},

	fetchUser: function (id) {
		return Q.when (this.pool.server.database ('_users'))
			.then (function (database) {
				return database.documents.get (id);
			});
	},

	fetched: function (user) {
		this.user = user.lock (this);

		// console.log ('@ lock', this.id, this.user.id);

		this.name = user.get ('name');
		this.roles = user.get ('roles');
	},

	sign: function (options) {
		var settings = this.settings;

		if (settings.oauth) {
			options.oauth = settings.oauth;
		} else if (settings.auth) {
			options.auth = settings.auth;
		}

		return options;
	},

	dispose: function () {
		this.user.release (this);
		this.cleanup ();
	},

	cleanup: function () {
		this.resources = null;
		this.user = null;
		this.settings = null;
		this.pool = null;
		this.cache = null;
	},

	get: function (id) {
		return this.pool.resources.get (this, id);

		
		// // This makes getting resources blazing fast
		// if (this.cache [id]) {
		// 	return this.cache [id];
		// }

		// return this.cache [id] = this.pool.resources.get (this, id);
		
	},

	create: function (data) {
		var pool = this.pool,
			self = this,
			app;

		return Q.when (pool.locateType (data.type))
			.then (function () {
				app = arguments [0];
				return pool.selectDb (this, pool.getAppDbs (app));
			})
			.then (function (db) {
				return pool.server.database (db);
			})
			.then (function (database) {
				return database.documents.create (app, data);
			})
			.then (function (document) {
				return self.get (document.id);
			});
	}
});
