var _ = require ('lodash'),
	Q = require ('q'),

	mixin = require ('fos-mixin'),
	request = require ('fos-request'),

	ClientResources = require ('./client-resources.js');


module.exports = function Client (pool, settings) {
	this.id = 'client #' + Date.now ();

	this.pool = pool;
	this.settings = settings || {};
	
	this.resources = new ClientResources (this);
};

mixin (module.exports);

function getUserId (info) {
	return 'org.couchdb.user:' + (info.name || 'nobody');
}

_.extend (module.exports.prototype, {
	user: null,

	name: null,
	roles: null,

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
		this.resources.dispose ();
		this.cleanup ();
	},

	cleanup: function () {
		this.resources = null;
		this.user = null;
		this.settings = null;
		this.pool = null;
	},

	get: function () {
		throw new Error ('who are you to call me?')
	}
});
