var _ = require ('lodash'),
	Promises = require ('vow'),
	Trigger = require ('./Trigger.js'),
	ClientResource = require ('./ClientResource.js');

module.exports = function (client) {
	this.client = client;
	this.pool = client.pool;

	this.cache = {};
	this.trigger = new Trigger (this);
};

_.extend (module.exports.prototype, {
	client: null, cache: null,

	get: function (id) {
		if (!id) return false; // throw new Error ('Resource id could not be empty');
		if (typeof id != 'string') return false; // throw new Error ('Resource id must be a string', typeof id, 'given');

		var resource = this.cache [id];

		if (resource && resource.disposing) {
			delete this.cache [id];
			resource = undefined;
		}

		if (!resource) {
			resource = this.cache [id] = new ClientResource (this.client, id);
			resource.lock (this.client);
		}

		return resource.ready ();
	},

	unset: function (id) {
		if (this.has (id)) {
			var resource = this.cache [id],
				self = this;
			
			Promises.when (resource)
				.then (function (resource) {
					resource.release (self.client);
				})
				.always (function () {
					delete self.cache [id];
				})
				.done ();
		}
	},

	create: function (data) {
		var pool = this.pool,
			client = this.client,
			self = this,

			eventId = 'urn:fos:trigger/391104364ed22cb4484513d25d42cf28',
			trigger = this.trigger;

		return Promises.when (pool.locateType (data.type))
			.then (function (app) {
				return Promises.when (
					pool.selectDb (client, pool.getAppDbs (app))
				)
					.then (function (db) {
						return pool.server.database (db);
					})

					.then (function (database) {
						var event = {
							data: data,
							client: client,
							database: database.name,
							app: app
						};

						return Promises.when (trigger (eventId, event))
							.fail (function (error) {
								if (error.stack) {
									console.error ('Creating trigger has failed', error.error, error.stack);
								} else {
									console.error ('Creating trigger has failed', error);
								}
							})
							.then (function () {
								if (!database.documents) {
									console.error ('Failed to get database documents', database.name, database.documents, database.disposing);
									return Promises.reject ('Failed to get database documents');
								}
								return database.documents.create (app, data, client.sign ());
							});
					});
			})

			.then (function (doc) {
				if (!doc) {
					console.error ('Missing document!!!!', doc);
				}
				return self.get (data._id || doc.id);
			});
	},

	has: function (id) {
		return this.cache [id] !== undefined;
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
		this.trigger = null;
	}
});