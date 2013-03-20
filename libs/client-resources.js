var	_ = require ('lodash'),
	Q = require ('q');

module.exports = function (client) {
	this.client = client;
	this.pool = client.pool;

	this.cache = {};
};

_.extend (module.exports.prototype, {
	client: null, cache: null,

	get: function (id) {
		return this.cache [id] ||
			(this.cache [id] = this.pool.resources.get (this.client, id));
	},

	create: function (data) {
		var pool = this.pool,
			client = this.client,
			self = this,
			app;

		return Q.when (pool.locateType (data.type))
			.then (function () {
				app = arguments [0];
				return pool.selectDb (client, pool.getAppDbs (app));
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
	},

	has: function (id) {
		return this.cache [id] !== undefined;
	},

	release: function (id) {
		if (this.has (id)) {
			// todo: beautify that
			var resource = this.cache [id];
			
			delete this.cache [id];

			Q.when (resource)
				.then (function (resource) {
					resource.release (this.client);
				})
				.done ();
		}
	},
	
	
	list: function () {
		return this.cache;
	},

	ids: function () {
		return _.keys (this.cache);
	},

	dispose: function () {
		this.client = null;
		this.pool = null;
		this.cache = null;
	}
});
