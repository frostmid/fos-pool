var _ = require ('lodash'),
	Promises = require ('vow'),
	request = require ('fos-request'),
	LRU = require ('lru-cache'),
	ClientResources = require ('./ClientResources.js');

var cache = LRU ({
	max: 50
});

module.exports = function (pool, settings) {
	this.id = 'client #' + Date.now ();
	this.pool = pool;
	this.settings = settings || {};

	this.resources = new ClientResources (this);
};

function getUserId (info) {
	return 'org.couchdb.user:' + (info.name || 'nobody');
}

_.extend (module.exports.prototype, {
	user: null,

	name: null,
	roles: null,

	sessionId: null,

	disposeDelay: 5 * 1000,

	fetch: function () {
		return Promises.when (this.fetchSession ())
			.then (getUserId)
			.then (_.bind (this.fetchUser, this))
	},

	fetchSession: function () {
		var key = JSON.stringify (this.settings.auth || this.settings.oauth);

		return cache.get (key) || request (
			this.sign ({
				url: this.pool.server.url + '_session',
				accept: 'application/json',
				headers: {
					'accept-encoding': 'gzip, deflate'
				}
			})
		)
			.then (function (resp) {
				if (!resp.ok) return new Error (resp);

				cache.set (key, resp.userCtx);

				return resp.userCtx;
			});
	},

	fetchUser: function (id) {
		return Promises.when (this.pool.server.database ('_users'))
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

		options = options || {};

		if (this.sessionId) {
			options.sessionId = this.sessionId;
		}

		if (settings.oauth) {
			options.oauth = settings.oauth;
		} else if (settings.auth) {
			options.auth = settings.auth;
		}

		return options;
	},

	dispose: function () {
		if (this.user) {
			this.user.release (this);
		}
		
		this.resources.dispose ();
		
		this.resources = null;
		this.user = null;
		this.settings = null;
		this.pool = null;
		this.settings = null;
	}
});