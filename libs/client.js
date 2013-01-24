var _ = require ('lodash'),
	Q = require ('q'),

	mixins = require ('fos-mixins'),
	request = require ('fos-request'),

	Resources = require ('./resources');


module.exports = function (pool, settings) {
	this.pool = pool;
	this.settings = settings || {};
	this.resources = (new Resources (this)).lock (this);
};

mixins (['ready', 'lock'], module.exports);

function getUserId (info) {
	return 'org.couchdb.user:' + (info.name || 'nobody');
}

_.extend (module.exports.prototype, {
	user: null,
	resources: null,

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
		return Q.all ([this.resources.release (this), this.user.release (this)])
			.then (_.bind (this.cleanup, this));
	},

	cleanup: function () {
		this.resources = null;
		this.user = null;
		this.settings = null;
		this.pool = null;
	}
});
