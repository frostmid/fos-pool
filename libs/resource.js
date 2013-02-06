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
			.on ('change', this.change);
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
		this.resources.unset (this.id);
		this.removeAllListeners ();

		if (this.source) {
			this.source
				.removeListener ('change', this.change)
				.release (this);
		}

		this.cleanup ();

		// console.log ('#dispose resource', this.id);
	},

	has: function (key) {
		return this.source.data [key] != undefined;
	},

	json: function () {
		if (this._prefetch) {
			var _prefetch = {};

			_.each (this._prefetch, function (value, index) {
				var set = function (value) {
					_prefetch [index] = value;
				};

				if (value) {
					if (value instanceof this.constructor) {
						set (value.json ());
					} else {
						set (
							_.map (value, function (v) {
								return v.json ();
							})
						);
					}
				} else {
					set (null);
				}
				
			}, this);

			return _.extend ({
				_prefetch: _prefetch
			}, this.source.data);
		} else {
			return this.source.data;
		}
	},

	cleanup: function () {
		this.source = null;
		this.changes = null;
		this.resources = null;
	}
});
