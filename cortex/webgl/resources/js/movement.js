var jsplot = (function (module) {
	var STATE = { NONE : -1, ROTATE : 0, PAN : 1, ZOOM : 2 };
	module.LandscapeControls = function() {
		this.target = new THREE.Vector3();
		this.azimuth = 45;
		this.altitude = 75;
		this.radius = 250;

		this.mix = 0;

		this.rotateSpeed = 0.4;
		this.panSpeed = 0.3;
		this.zoomSpeed = 0.002;
		this.clickTimeout = 200; // milliseconds

		this.friction = .9;

		this._start = new THREE.Vector2();
		this._end = new THREE.Vector2();

		this._momentum = {change:[0,0]};
		this._state = STATE.NONE;
	}
	THREE.EventDispatcher.prototype.apply(module.LandscapeControls.prototype);

	module.LandscapeControls.prototype._position = function() {
		var altrad = this.altitude*Math.PI / 180;
		var azirad = (this.azimuth+90)*Math.PI / 180;

		return new THREE.Vector3(
			this.radius*Math.sin(altrad)*Math.cos(azirad),
			this.radius*Math.sin(altrad)*Math.sin(azirad),
			this.radius*Math.cos(altrad)
		);
	}

	module.LandscapeControls.prototype.update = function(camera) {
		var func;
		if (this._state != STATE.NONE) {
			if (this._state == STATE.ROTATE)
				func = this.rotate
			else if (this._state == STATE.PAN)
				func = this.pan
			else if (this._state == STATE.ZOOM)
				func = this.zoom

			var mousechange = this._end.clone().sub(this._start);
			func.call(this, mousechange.x, mousechange.y);
		}

		if (Math.abs(this._momentum.change[0]) > .05) {
			this._momentum.change[0] *= this.friction;
			this._momentum.change[1] *= this.friction;
		//	console.log(this._momentum.change);
			this._momentum.func.apply(this, this._momentum.change);
			setTimeout(function() {
				this.dispatchEvent( { type: "change" } );
			}.bind(this), 0);
		}

		camera.position.addVectors( this.target, this._position() );
		camera.lookAt( this.target );
		this._start = this._end;
	}

	module.LandscapeControls.prototype.rotate = function(x, y) {
		var mix = Math.pow(this.mix, 2);
		this.pan(x * mix, y * mix);
		
		var rx = x  * (1 - mix), ry = y * (1 - mix);
		this.setAzimuth(this.azimuth - this.rotateSpeed * rx);		
		this.setAltitude(this.altitude - this.rotateSpeed * ry);

		this._momentum.change = [x, y];
		this._momentum.func = this.rotate;
	}

	var _upvec = new THREE.Vector3(0,0,1);
	module.LandscapeControls.prototype.pan = function(x, y) {
		var eye = this._position();

		var right = eye.clone().cross( _upvec );
		var up = right.clone().cross(eye);
		var pan = right.setLength( this.panSpeed * x ).add(
			up.setLength( this.panSpeed * y ));
		this.target.add( pan );
	}

	module.LandscapeControls.prototype.zoom = function(x, y) {
		this.setRadius(this.radius * (1 + this.zoomSpeed * y));
	}

	module.LandscapeControls.prototype.setMix = function(mix) {
		this.mix = mix;
		this.setAzimuth(this.azimuth);
		this.setAltitude(this.altitude);
	}

	module.LandscapeControls.prototype.setAzimuth = function(az) {
		if (az === undefined)
			return this.azimuth;

		if (this.mix > 0) {
			var azlim = this.mix * 180;
			if (azlim > az || az > (360 - azlim)) {
				var d1 = azlim - az;
				var d2 = 360 - azlim - az;
				az = Math.abs(d1) > Math.abs(d2) ? 360-azlim : azlim;
			}
		}
		this.azimuth = az < 0 ? az + 360 : az % 360;
	}
	module.LandscapeControls.prototype.setAltitude = function(alt) {
		if (alt === undefined)
			return this.altitude;

		var altlim = this.mix * 90;
		alt = alt > 179.9999-altlim ? 179.9999-altlim : alt;
		this.altitude = alt < 0.0001+altlim ? 0.0001+altlim : alt;
	}
	module.LandscapeControls.prototype.setRadius = function(rad) {
		if (rad === undefined)
			return this.radius;

		this.radius = Math.max(Math.min(rad, 600), 85);
	}

	module.LandscapeControls.prototype.setTarget = function(xyz) {
		if (!(xyz instanceof Array))
			return [this.target.x, this.target.y, this.target.z];

		this.target.set(xyz[0], xyz[1], xyz[2]);
	}

	module.LandscapeControls.prototype.bind = function(object) {
		var _mousedowntime = 0;
		var _clicktime = 0; // Time of last click (mouseup event)
		var _indblpick = false; // In double-click and hold?
		var _picktimer = false; // timer that runs pick event
		//this._momentumtimer = false; // time that glide has been going on post mouse-release
		var _nomove_timer;

		var keystate = null;
		var changeEvent = { type: 'change' };

		function getMouse ( event ) {
			var off = $(event.target).offset();
			return new THREE.Vector2( event.clientX - off.left, event.clientY - off.top);
		};

		// listeners
		function keydown( event ) {
			if (event.keyCode == 17) {
				keystate = STATE.ZOOM;
			} else if (event.keyCode == 16) {
				keystate = STATE.PAN;
			} else {
				keystate = null;
			}

		};

		function keyup( event ) {
			keystate = null;
		};

		function mousedown( event ) {
			event.preventDefault();
			event.stopPropagation();

			if ( this._state === STATE.NONE ) {
				this._state = keystate !== null ? keystate : event.button;
				this._start = this._end = getMouse(event);
				if (event.button == 0) {
					_mousedowntime = new Date().getTime();
				}

				// Run double-click event if time since last click is short enough
				if ( _mousedowntime - _clicktime < this.clickTimeout && event.button == 0 ) {
					if (_picktimer) clearTimeout(_picktimer);
					var mouse2D = getMouse(event).clone();
					this.dispatchEvent({ type:"dblpick", x:mouse2D.x, y:mouse2D.y, keep:keystate == STATE.ZOOM });
					_indblpick = true;
				} else {
					this.dispatchEvent({ type:"mousedown" });
				}
			}
		};

		function mouseup( event ) {
			this._momentumtimer = new Date().getTime();

			event.preventDefault();
			event.stopPropagation();

			this._state = STATE.NONE;
			if (event.button == 0) {
				_clicktime = new Date().getTime();
			}

			// Run picker if time since mousedown is short enough
			if ( _clicktime - _mousedowntime < this.clickTimeout && event.button == 0) {
				var mouse2D = getMouse(event).clone();
				this.dispatchEvent({ type: "mouseup" });
				this.dispatchEvent({ type:"pick", x:mouse2D.x, y:mouse2D.y, keep:keystate == STATE.ZOOM});
			} else if ( event.button == 0 && _indblpick == true ) {
				this.dispatchEvent({ type:"undblpick" });
				_indblpick = false;
			} else {
				this.dispatchEvent({ type: "mouseup" });
			}
			this.dispatchEvent(changeEvent);
		};

		function mousemove( event ) {
			if ( this._state !== STATE.NONE ) {
				this._end = getMouse(event);
				this.dispatchEvent( changeEvent );
			}
		};


		function mousewheel( event ) {
			event.preventDefault();
			event.stopPropagation();
			if ( this._state !== STATE.NONE ) {
				this.setRadius(this.radius * this.zoomSpeed * -1 * wheelEvent.wheelDelta/10.0);
				this.dispatchEvent( changeEvent );
			}
		};

		//code from http://vetruvet.blogspot.com/2010/12/converting-single-touch-events-to-mouse.html
		var touchToMouse=function(b){if(!(b.touches.length>1)){var a=b.changedTouches[0],c="";switch(b.type){case "touchstart":c="mousedown";break;case "touchmove":c="mousemove";break;case "touchend":c="mouseup";break;default:return}var d=document.createEvent("MouseEvent");d.initMouseEvent(c,true,true,window,1,a.screenX,a.screenY,a.clientX,a.clientY,false,false,false,false,0,null);a.target.dispatchEvent(d);b.preventDefault()}};
		object.addEventListener( 'touchstart', touchToMouse );
		object.addEventListener( 'touchmove', touchToMouse );
		object.addEventListener( 'touchend', touchToMouse );

		object.addEventListener( 'contextmenu', function ( event ) { event.preventDefault(); }, false );

		object.addEventListener( 'mousemove', mousemove.bind(this), false );
		object.addEventListener( 'mousedown', mousedown.bind(this), false );
		object.addEventListener( 'mouseup', mouseup.bind(this), false );
		object.addEventListener( 'mousewheel', mousewheel.bind(this), false);
		object.addEventListener( 'mouseout', mouseup.bind(this), false );

		window.addEventListener( 'keydown', keydown.bind(this), false );
		window.addEventListener( 'keyup', keyup.bind(this), false );
	}

	return module;
}(jsplot || {}));