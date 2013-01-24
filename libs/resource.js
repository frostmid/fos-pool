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

	_models: null,
	_type: null,
	_prefetched: null,

	fetch: function () {
		return this.resources.locate (this.id)
			.then (_.bind (function (origin) {
				this.origin = origin;
				return this.resources.resolve (origin, this.id);
			}, this));
	},

	prefetch: function () {
		return Q.all ([
			this.prefetchModels (),
			Q.when (this.prefetchType ())
				.then (_.bind (this.prefetchReferences, this))
		]);
	},

	prefetchType: function () {
		if (this._type) {
			if (this._type != this) {
				this._type.release (this);
			}
			
			this._type = null;
		}

		if (this.disposing) return;

		if (this.source.has ('type')) {
			var id = this.source.get ('type');

			if (this.id == id) {
				this._type = this;
			} else {
				return Q.when (this.resources.get (id))
					.then (_.bind (function (resource) {
						this._type = resource.lock (this);
					}, this));
			}
		}
	},

	prefetchReferences: function () {
		return;

		if (this._prefetch) {
			// TODO: Release prefetched resources
			console.log ('TODO: Release prefetched resources');
			this._prefetch = null;
		}

		if (!this._type) {
			return;
		}

		var prefetch = {}, count = 0;
		_.each (this._type.get ('fields'), function (field) {
			if (field.prefetch) {
				var value = this.get (field.name);

				if (value && value.length) {
					prefetch [field.name] = value;
					count++;
				}
			}
		}, this);

		if (count) {
			this._prefetch = {};
		} else {
			return;
		}

		return Q.all (
			_.map (prefetch, function (value, index) {
				var set = _.bind (function (prefetched) {
					this._prefetch [index] = prefetched;
				}, this);

				var lock = _.bind (function (resource) {
					return resource.lock (this);
				}, this);

				// TODO: Lock prefetched resources

				if (typeof value == 'string') {
					return this.resources.get (value)
						.then (lock)
						.then (set);
				} else {
					return Q.all (_.map (value, this.resources.get, this.resources))
						.then (function (resources) {
							return _.map (resources, lock);
						})
						.then (set);
				}
			}, this)
			
		)
	},

	prefetchModels: function () {
		if (this._models && this._models.length) {
			_.each (this._models, function (resource) {
				resource.release (this);
			}, this);
			this._models = null;
		}

		
		if (this.source.has ('rows')) {
			var lock = _.bind (function (resource) {
				return resource.lock (this);
			}, this);

			var fetch = _.bind (function (row) {
				return Q.when (this.resources.get (row.id)).then (lock);
			}, this);

			return Q.all (_.map (this.source.get ('rows'), fetch, this))
				.then (_.bind (function (resources) {
					this._models = resources;
				}, this));
		}
	},

	models: function () {
		return this._models;
	},

	fetched: function (source) {
		if (this.source) {
			this.source.removeListener ('change', this.change);
		}

		(this.source = source)
			.lock (this)
			.on ('change', this.change);

		return this.prefetch ();
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
	},

	has: function (key) {
		return this.source.data [key] != undefined;
	},

	cleanup: function () {
		if (this._type) {
			this._type.release (this);
			this._type = null;
		}

		if (this._models) {
			_.each (this.models, function (resource) {
				resource.release (this);
			}, this);
			this._prefetched = null;
		}

		if (this._prefetched) {
			_.each (this._prefetched, function (resource) {
				resource.release (this);
			}, this);
			this._prefetched = null;
		}

		this.source = null;
		this.changes = null;
		this.resources = null;
	}
});
