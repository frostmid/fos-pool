var _ = require ('lodash'),
	Promises = require ('vow'),
	mixin = require ('fos-mixin');	

module.exports = function (resources, origin, id) {
	this.resources = resources;
	this.origin = origin;
	this.id = id;

	this.change = _.bind (this.change, this);

	this.setMaxListeners (1002);
};

mixin (module.exports);

_.extend (module.exports.prototype, {
	source: null,

	disposeDelay: 1000 * 5,

	fetch: function () {
		return this.resources.resolve (this.origin, this.id);
	},

	fetched: function (source) {
		if (this.source && this.change) {
			this.source.removeListener ('change', this.change);
		}

		(this.source = source)
			.lock (this)
			.on ('change', this.change);
	},

	failed: function (error) {
		this.forceRelease ();
		return Promises.reject (error);
	},

	change: function () {
		this.emit ('change', this);
	},

	get: function (key) {
		switch (key) {
			case '_id':
				return this.id;

			default:
				if (this.source && this.source.data) {
					return this.source.data ? this.source.data [key] : null;
				} else {
					// console.log (this.id, 'has no source or data', this.source.error);
				}
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
		// if (data) {
		// 	this.set (data);
		// }

		return this.source.save (this.id.split ('/') [0], data, sign)
			.then (_.bind (this.ready, this));
	},

	dispose: function () {
		this.resources.unset (this);
		
		if (this.source) {
			this.source
				.removeListener ('change', this.change)
				.release (this);
		}

		this.source = null;
		this.change = null;
		this.resources = null;
	},

	has: function (key) {
		return this.source.data [key] != undefined;
	}
});