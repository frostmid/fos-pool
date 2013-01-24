var Q = require ('q'),
	_ = require ('lodash'),

	mixins = require ('fos-mixins'),
	Server = require ('fos-couch'),

	Client = require ('./client');


module.exports = function (options) {
	this.id = 'pool #' + Date.now ();
	this.options = options;
	this.server = new Server (options.server);
	// TODO:
	// this.models = new Models (this);
	// this.models.get (origin, id/resolved, some other shit)
};

mixins (['ready'], module.exports);

_.extend (module.exports.prototype, {
	appIndex: null,
	appNames: null,

	settings: {
		appDbPrefix: 'app/',

		urn2db: function (name) {
			var tmp = name.match (/^urn:applications\/(.*)/);
			return tmp ? this.settings.appDbPrefix + tmp [1] : name;
		},

		app2id: function (app) {
			if (app.design && app.design._id) {
				return app.design._id.substring ('_design/'.length);
			}

			return 'urn:' + app._id.substring ('urn:applications/'.length);
		},

		isApp: function (urn) {
			return urn.indexOf ('/') === -1;
		},

		clientDb: function (client, dbs) {
			var db = dbs [0];

			if (/^roles\//.test (db)) {
				return client.user.get ('database');
			}

			return db;
		}
	},

	fetch: function () {
		return Q.when (this.server.ready ())
			.then (_.bind (this.buildIndex, this));
	},

	buildIndex: function () {
		return Q.when (this.server.database ('sys/apps'))
			.then (function (database) {
				return database.views.get ('urn:applications', 'all');
			})
			.then (function (view) {
				return view.get ({});
			});
	},

	client: function (params) {
		return (new Client (this, params)).ready ();
	},

	fetched: function (applications) {
		var appIndex = {};
			
		_.each (applications.get ('rows'), function (row) {
			appIndex [row.value.id] = {
				dbs: _.map (row.value.shared, this.settings.urn2db, this),
				types: row.value.updates
			};
		}, this);

		this.appIndex = appIndex;

		this.appNames = _.sortBy (
			_.keys (appIndex),

			function (name) {
				return name.length;
			}
		);

		applications.once ('change', _.bind (function () {
			this.update (applications);
		}, this));
	},

	findApp: function (urn) {
		var prefix = urn.split (/[\/\?]/) [0];
		return (this.appNames.indexOf (prefix) != -1) ? prefix : false;
	},

	getAppDbs: function (app) {
		return this.appIndex [app].dbs;
	}
});
