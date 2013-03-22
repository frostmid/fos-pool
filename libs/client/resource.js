var	_ = require ('lodash'),
	Q = require ('q'),

	mixin = require ('fos-mixin');


module.exports = function ClientResource (client, id) {
	this.id = id;
	this.client = client;
	this.change = _.bind (this.change, this);
};

mixin (module.exports);

_.extend (module.exports.prototype, {
	id: null, client: null, resource: null,

	fetch: function () {
		return this.client.pool.resources.get (this.client, this.id);
	},

	fetched: function (resource) {
		this.resource = resource.lock (this);
		this.resource.on ('change', this.change);
	},

	dispose: function () {
		this.client.resources.unset (this.id);

		if (this.resource) {
			this.resource.removeListener ('change', this.change);
			this.resource.release (this);
			this.resource = null;
		}
		this.client = null;
		this.id = null;
	},

	change: function () {
		this.emit ('change', this);
	},

	save: function (data) {
		this.resource.save (data, this.client.settings);
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
		return this.resource.source.getAttachment (name, this.client.settings);
	},

	saveAttachment: function (attachment) {
		return this.resource.source.saveAttachment (attachment, this.client.settings);
	},

	removeAttachment: function (name) {
		return this.resource.source.removeAttachment (name, this.client.settings);
	}
});

_.each (['get', 'set', 'has'], function (method) {
	module.exports.prototype [method] = function () {
		return this.resource [method].apply (this.resource, arguments);
	};
});
