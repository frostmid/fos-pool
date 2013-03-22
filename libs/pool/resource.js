var	_ = require ('lodash'),
	Q = require ('q'),

	mixin = require ('fos-mixin');

module.exports = function PoolResource (resources, origin, id) {
	this.resources = resources;
	this.origin = origin;
	this.id = id;

	this.change = _.bind (this.change, this);
};

mixin (module.exports);

_.extend (module.exports.prototype, {
	source: null,

	disposeDelay: 1000 * 60,

	fetch: function () {
		return this.resources.resolve (this.origin, this.id);
	},

	fetched: function (source) {
		if (this.source) {
			this.source.removeListener ('change', this.change);
		}

		(this.source = source)
			.lock (this)
			.on ('change', this.change);
	},

	change: function () {
		this.emit ('change', this);
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

	save: function (data, sign) {
		if (data) {
			this.set (data);
		}

		return this.source.save (this.id.split ('/') [0], sign)
			.fail (_.bind (this.returnError, this))
			.then (_.bind (this.returnNotReady, this))
			.then (_.bind (this.ready, this));
	},

	dispose: function () {
		this.resources.unset (this);
		this.removeAllListeners ();

		if (this.source) {
			this.source
				.removeListener ('change', this.change)
				.release (this);
		}

		this.cleanup ();
	},

	has: function (key) {
		return this.source.data [key] != undefined;
	},

	cleanup: function () {
		this.source = null;
		this.changes = null;
		this.resources = null;
	}
});
