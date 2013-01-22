var _ = require ('lodash'),
	Q = require ('q'),

	mixins = require ('fos-mixins');


module.exports = function (resources, id) {
	this.resources = resources;
	this.id = id;
	this.change = _.bind (this.change, this);
};

mixins (['emitter', 'ready', 'lock'], module.exports);

_.extend (module.exports.prototype, {
	source: null,
	origin: null,

	fetch: function () {
		return this.resources.locate (this.id)
			.then (_.bind (function (origin) {
				this.origin = origin;
				return this.resources.resolve (origin, this.id);
			}, this));
	},

	fetched: function (source) {
		if (this.source) {
			this.source.removeListener ('change', this.change);
		}

		(this.source = source)
			.lock (this)
			.once ('change', this.change);
	},

	change: function () {
		this.emit ('change');
	},

	get: function (key) {
		switch (key) {
			case '_id':
				return this.id;

			default:
				return this.source.data [key];
		}
	},

	set: function () {
		var data;
		if (arguments.length == 2) {
			data = {};
			data [arguments [0]] = arguments [1];
		} else {
			data = arguments [0];
		}

		_.extend (this.source.data, data);
	},

	save: function (data) {
		if (data) {
			this.set (data);
		}

		return this.source.save (this.origin);
	},

	remove: function () {
		return this.source.remove (this.origin);
	},

	stringify: function () {
		return JSON.stringify (this.source.data);
	},

	dispose: function () {
		this.removeAllListeners ();
		this.resources.unset (this.id);

		if (this.source) {
			this.source
				.removeListener ('change', this.change)
				.release (this);
		}

		this.cleanup ();
	},

	cleanup: function () {
		this.source = null;
		this.changes = null;
		this.resources = null;
	}
});
