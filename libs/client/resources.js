var	_ = require ('lodash'),
	Promises = require ('vow'),
	ClientResource = require ('./resource');

module.exports = function ClientResources (client) {
	this.client = client;
	this.pool = client.pool;

	this.cache = {};
};

_.extend (module.exports.prototype, {
	client: null, cache: null,

	get: function (id) {
		if (!id) return false; // throw new Error ('Resource id could not be empty');
		if (typeof id != 'string') return false; // throw new Error ('Resource id must be a string', typeof id, 'given');
		
		var resource = this.cache [id];

		if (!resource) {
			resource = this.cache [id] = new ClientResource (this.client, id);
		}

		return resource.ready ();
	},

	unset: function (id) {
		delete this.cache [id];
	},

	create: function (data) {
		var pool = this.pool,
			client = this.client,
			self = this,
			app;

		return Promises.when (pool.locateType (data.type))
			.then (function () {
				app = arguments [0];
				return pool.selectDb (client, pool.getAppDbs (app));
			})
			.then (function (db) {
				return pool.server.database (db);
			})
			.then (function (database) {
				return database.documents.create (app, data, client.settings);
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

			Promises.when (resource)
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
