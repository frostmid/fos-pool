var Promises = require ('vow'),
	_ = require ('lodash'),

	mixin = require ('fos-mixin'),
	Server = require ('fos-couch'),

	Client = require ('../client'),
	Resources = require ('./resources');

// Promises.longStackJumpLimit = 0;

module.exports = function Pool (options) {
	this.id = 'pool #' + Date.now ();
	this.options = options;
	this.server = (new Server (options.server)).lock (true);
	this.resources = (new Resources (this)).lock (true);
};

mixin (module.exports);

_.extend (module.exports.prototype, {
	appIndex: null,
	appNames: null,
	appRoutes: null,	// TODO: Review this implementation

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
		return Promises.when (this.server.ready ())
			.then (_.bind (this.buildIndex, this));
	},

	buildIndex: function () {
		// TODO: Rebuild index on view update
		return Promises.when (this.server.database ('sys/apps'))
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
		var appIndex = [];
			
		_.each (applications.get ('rows'), function (row) {
			appIndex [row.value.id] = {
				dbs: _.map (row.value.shared, this.settings.urn2db, this),
				types: row.value.updates
			};
		}, this);

		this.appIndex = appIndex;
		this.appNames = _.keys (appIndex);

		///
		var appRoutes = {};
		_.each (this.appNames, function (urn) {
			var url = '/' + urn.substring (4).replace (/:/g, '/');
			appRoutes [url] = urn;
		});
		this.appRoutes = appRoutes;
		///

		applications.once ('change', _.bind (function () {
			this.update (applications);
		}, this));
	},

	findApp: function (urn) {
		if (!this.appNames) {
			throw new Error ('apps index was not loaded');
		}

		if (typeof urn != 'string') return false;

		var prefix = urn.split (/[\/\?]/) [0];
		return (this.appNames.indexOf (prefix) != -1) ? prefix : false;
	},

	findAppByType: function (type) {
		var index = this.appIndex;

		if (!index) {
			throw new Error ('apps index was not loaded');
		}

		if (typeof type != 'string') return false;

		for (var app in index) {
			if (index [app].types.indexOf (type) !== -1) {
				return app;
			}
		}
	},

	selectDb: function (client, dbs) {
		if (!dbs.length) return null;

		var dbs = dbs.slice (0),
			db = dbs.shift ();

		if (/^roles\//.test (db)) {
			db = client.user.get ('database');
		}

		return db;
	},

	locate: function (client, id) {
		var app, dbs;

		if (app = this.findApp (id)) {
			return this.selectDb (client, this.getAppDbs (app));
		} else {
			return false;
		}
	},

	locateType: function (type) {
		var app, dbs;

		if (app = this.findAppByType (type)) {
			return app;
		} else {
			return Promises.reject ({
				error: 'not_found',
				reason: 'missing'
			});
		}
	},

	getAppDbs: function (app) {
		return this.appIndex [app].dbs;
	}
});
