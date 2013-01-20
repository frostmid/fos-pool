var _ = require ('lodash'),
	Q = require ('q'),

	mixins = require ('fos-mixins'),
	request = require ('fos-request'),

	Resources = require ('./resources');


module.exports = function (pool, settings) {
	this.pool = pool;
	this.settings = settings;
	this.resources = new Resources (this);
};

mixins (['ready'], module.exports);

function getUserId (info) {
	return 'org.couchdb.user:' + (info.name || 'nobody');
}

_.extend (module.exports.prototype, {
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

	update: function (user) {
		this.user = user;
	},

	sign: function (options) {
		var settings = this.settings;

		if (settings.oauth) {
			options.oauth = settings.oauth;
		} else if (settings.auth) {
			options.auth = settings.auth;
		}

		return options;
	}
});
