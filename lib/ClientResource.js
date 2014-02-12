var _ = require ('lodash'),
	Promises = require ('vow');

module.exports = function (client, id) {
	this.id = id;
	this.client = client;
	this.change = _.bind (this.change, this);

	this.setMaxListeners (1001);
};

_.extend (module.exports.prototype, {
	id: null, client: null, resource: null, error: null,

	fetch: function () {
		if (this.client) {
			var result = this.client.pool.resources.get (this.client, this.id);
			if (result.ready) {
				return result.ready ();
			} else {
				return result;
			}
		}
	},

	fetched: function (resource) {
		this.error = resource.error;
		resource.error = null;

		this.resource = resource.lock (this);
		this.resource.removeListener ('change', this.change);
		this.resource.on ('change', this.change);

		if (resource.source) {
			var errors = this.errors ();
			if (errors) {
				return Promises.reject (errors);
			}
		} else {
			return Promises.reject ('Empty resource source');
		}
	},

	failed: function (error) {
		this.forceRelease ();
		return Promises.reject (error);
	},

	dispose: function () {
		if (this.resource) {
			this.resource.removeListener ('change', this.change);
			this.resource.release (this);
			this.resource = null;
		}

		this.client = null;
		this.id = null;
		this.change = null;
		this.error = null;
	},

	change: function () {
		this.emit ('change', this);

		if (this.get ('_deleted')) {
			this.forceRelease ();
		}
	},

	save: function (data) {
		if (!this.client || !this.client.resources) return;

		var eventId = 'urn:fos:trigger/4e2ab2e137480e971c82bdb41d4fcfbb',
			event = {
				resource: this,
				data: data
			}, self = this,
			trigger = this.client.resources.trigger;

		this.returnNotReady ();

		return Promises.when (trigger (eventId, event))
			.fail (function (error) {
				console.error ('Client resource trigger error', error);
			})
			.then (function () {
				if (self.resource) {
					return self.resource.save (data, self.client.settings);
				}
			})
			.then (_.bind (this.ready, this));
	},

	remove: function () {
		return this.save ({
			_deleted: true
		});
	},

	stringify: function () {
		return JSON.stringify (this.getSource ().data);
	},

	getSource: function () {
		return this.resource.source;
	},

	json: function () {
		var result = _.extend ({
			_id: this.id
		}, this.resource.source.data);

		if (this._type) {
			result._type = this._type.json ();
		}

		if (this._prefetch) {
			var prefetch = {};
			
			_.each (this._prefetch, function (value, index) {
				if (!value) return;

				if (value.json) {
					prefetch [index] = value.json ();
				} else {
					prefetch [index] = [];

					_.each (value, function (model) {
						prefetch [index].push (model.json ());
					});
				}
			});

			result._prefetch = prefetch;
		}

		return result;
	},

	getAttachment: function (name) {
		name = decodeURIComponent (name);
		return this.resource.source.getAttachment (name, this.client.settings);
	},

	saveAttachment: function (attachment) {
		return this.resource.source.saveAttachment (attachment, this.client.settings);
	},

	removeAttachment: function (name) {
		return this.resource.source.removeAttachment (name, this.client.settings);
	},

	errors: function () {
		return this.resource.source.error;
	},

	get: function () {
		if (this.resource) {
			return this.resource [method].apply (this.resource, arguments);
		}
	},

	set: function () {
		if (this.resource) {
			return this.resource [method].apply (this.resource, arguments);
		}
	},

	has: function () {
		if (this.resource) {
			return this.resource [method].apply (this.resource, arguments);
		}
	}
});