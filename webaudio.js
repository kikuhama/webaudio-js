WebAudio.STOPPING_STATE = 0;
WebAudio.PLAYING_STATE = 1;
WebAudio.PAUSING_STATE = 2;

function WebAudio() {
    this.webAudioApiSupported = false;
    this.forceUseHtml5Audio = false;
    this.audioContext = null;
    this.masterGain = null;
    this.state = WebAudio.STOPPING_STATE;
    this.loadedBuffers = {};

    // check Web Audio API is supported
    var contextClass = (window.AudioContext ||
			window.webkitAudioContext ||
			window.mozAudioContext ||
			window.oAudioContext ||
			window.msAudioContext);
    var context = undefined;
    if(contextClass) {
	context = new contextClass();
	if(context) {
	    this.webAudioApiSupported = true;
	    this.audioContext = context;
	    var gain;
	    if(this.audioContext.createGain) {
		gain = this.audioContext.createGain();
	    }
	    else if(this.audioContext.createGainNode) {
		gain = this.audioContext.createGainNode();
	    }
	    gain.connect(this.audioContext.destination);
	    this.masterGain = gain;
	}
    }
}

WebAudio.instance = function() {
    // get singleton instance
    if(!WebAudio._instance) {
	WebAudio._instance = new WebAudio();
    }
    return WebAudio._instance;
}

WebAudio.prototype.setForceUseHtml5Audio = function(useHtml5Audio) {
    // set to use HTML5 Audio or not
    this.forceUseHtml5Audio = useHtml5Audio;
}

WebAudio.prototype.isWebAudioApiSupported = function() {
    // return user's browser supports Web Audio API or not
    return this.webAudioApiSupported;
}

WebAudio.prototype.useWebAudioApi = function() {
    // return use Web Audio API or not
    return (this.webAudioApiSupported && !this.forceUseHtml5Audio);
}

WebAudio.prototype.loadUrl = function(url, loadedHandler) {
    // load single audio file
    var webaudio = this;
    if(this.useWebAudioApi()) {
	var onLoaded = function(bufferList) {
	    webaudio.loadedBuffers[url] = bufferList[0];
	    if(loadedHandler) {
		loadedHandler();
	    }
	};
	var loader = new BufferLoader(this.audioContext, [url], onLoaded);
	loader.load();
    }
}

WebAudio.prototype.playByUrl = function(url, finishedHandler) {
    // play single audio file
    var webaudio = this;
    if(this.useWebAudioApi()) {
	// use Web Audio API
	var onLoaded = function(bufferList) {
	    webaudio.loadedBuffers[url] = bufferList[0];
	    webaudio.playBuffer(bufferList[0], finishedHandler);
	};

	if(this.loadedBuffers[url]) {
	    this.playBuffer(this.loadedBuffers[url], finishedHandler, 0);
	}
	else {
	    this.loadUrl(url, function() {
		webaudio.playBuffer(webaudio.loadedBuffers[url], finishedHandler, 0);
	    });
	}
    }
    else {
	// use HTML5 Audio
	var audio;
	if(webaudio.currentPlaylist) {
	    for(var i=0; i<webaudio.currentPlaylist.length; ++i) {
		var item = webaudio.currentPlaylist[i];
		if(item.src && item.src == url) {
		    audio = item;
		}
	    }
	}
	if(!audio) {
	    audio = new Audio(url);
	}
	webaudio.playHtml5Audio(audio, finishedHandler);
    }
}

WebAudio.prototype.playListItem = function() {
    var webaudio = this;

    if(webaudio.currentPlaylistIndex < 0) {
	throw "Invalid playlist index";
    }
    else if (webaudio.currentPlaylistIndex < webaudio.currentPlaylist.length) {
	var item = this.currentPlaylist[webaudio.currentPlaylistIndex];
	var itemInfo = {
	    src: null,
	    duration: 0
	};
	if($.isNumeric(item)) {
	    // interval time
	    itemInfo.src = null;
	    itemInfo.duration = item;
	    var now = new Date();
	    webaudio.intervalTimeoutFunction = function() {
		webaudio.intervalTimerId = null;
		webaudio.intervalStartTime = null;
		webaudio.currentIntervalTime = null;
		webaudio.intervalTimeoutFunction = null;
		webaudio.currentPlaylistIndex++;
		webaudio.playListItem();
	    };
	    webaudio.currentIntervalTime = item;
	    webaudio.intervalStartTime = now.getTime();
	    webaudio.intervalTimerId = setTimeout(webaudio.intervalTimeoutFunction,
						  item);
	}
	else if(item.play !== undefined) {
	    // HTML5 Audio Object
	    itemInfo.src = item.src;
	    webaudio.playHtml5Audio(item, function() {
		webaudio.currentPlaylistIndex++;
		webaudio.playListItem();
	    });
	}
	else {
	    // String (URL)
	    itemInfo.src = item;
	    webaudio.playByUrl(item, function() {
		webaudio.currentPlaylistIndex++;
		webaudio.playListItem();
	    });
	}
	
	if(webaudio.playItemHandler) {
	    webaudio.playItemHandler(itemInfo);
	}
	
	if(webaudio.currentPlaylistIndex < this.currentPlaylist.length - 1) {
	    var nextItem = this.currentPlaylist[webaudio.currentPlaylistIndex+1];
	    if(!$.isNumeric(nextItem) && nextItem.play == undefined) {
		// preload Web Audio API buffer
		webaudio.loadUrl(nextItem);
	    }
	}
    }
    else {
	// finished
	webaudio.state = WebAudio.STOPPING_STATE;
	if(webaudio.playlistFinishedHandler) {
	    webaudio.playlistFinishedHandler();
	}
    }
}

WebAudio.prototype.playByList = function(playlist, playItemHandler, finishedHandler) {
    // play audio by play list
    var webaudio = this;
    
    this.currentPlaylist = playlist;
    this.currentPlaylistIndex = 0;
    this.playItemHandler = playItemHandler
    this.playlistFinishedHandler = finishedHandler
    if(this.useWebAudioApi()) {
	// use Web Audio API
	this.loadUrl(playlist[0], function() {
	    webaudio.playListItem();
	});
    }
    else {
	// use HTML5 Audio
	webaudio.playListItem();
    }
}

WebAudio.prototype.preloadHtml5AudioPlaylist = function(playlist, progressHandler, finishedHandler) {
    if(!this.useWebAudioApi()) {
	// use HTML5 Audio
	var loadedCount = 0;
	var totalCount = 0;
	$.each(playlist, function(index, item) {
	    // count up audio datas
	    if(item && !$.isNumeric(item)) {
		totalCount++;
	    }
	});
	$.each(playlist, function(index, item) {	
	    if(item && !$.isNumeric(item)) {
		var audio = new Audio(item);
		$(audio).on("loadeddata", function() {
		    loadedCount++;
		    if(progressHandler) {
			progressHandler(loadedCount / totalCount);
		    }
		    if(loadedCount ==  totalCount && finishedHandler) {
			finishedHandler(playlist);
		    }
		});
		audio.load();
		playlist[index] = audio;
	    }
	});
    }
};

WebAudio.prototype.playHtml5Audio = function(audio, finishedHandler) {
    $(audio).bind("ended", function(e) {
	if(finishedHandler) {
	    finishedHandler();
	}
	$(audio).unbind("ended");
    });
    audio.autoplay = false;
    audio.play();
    this.currentAudio = audio;
    this.state = WebAudio.PLAYING_STATE;
}

WebAudio.prototype.playBuffer = function(buffer, finishedHandler, startOffset) {
    var source = this.audioContext.createBufferSource();
    var onended = function() {
	if(finishedHandler) {
	    finishedHandler();
	}
	source.disconnect(0);
	this.currentBuffer = null;
	this.currentSource = null;
	this.playingTimerId = null;
	this.playFinishedHandler = null;
	this.state = WebAudio.STOPPING_STATE;
    };
    var duration = buffer.duration * 1000;
    var offset = startOffset % duration;
    source.buffer = buffer;
    this.currentBuffer = buffer; 
    source.connect(this.masterGain);
    if(source.start) {
	source.start(0, offset);
    }
    else {
	source.noteOn(0, offset);
    }
    this.startTime = this.audioContext.currentTime;
    this.currentSource = source;
    this.state = WebAudio.PLAYING_STATE;
    this.playingTimerId = setTimeout(onended, duration - offset);
    this.playFinishedHandler = finishedHandler;
}

WebAudio.prototype.pause = function() {
    if(this.state == WebAudio.PLAYING_STATE) {
	if(this.intervalTimerId) {
	    // play list interval
	    clearTimeout(this.intervalTimerId);
	    this.intervalTimerId = null;
	    var now = new Date();
	    this.currentIntervalTime -= (now.getTime() - this.intervalStartTime);
	    this.intervalStartTime = null;
	}
	else if(this.useWebAudioApi()) {
	    // Web Audio API
	    if(this.currentSource && this.playingTimerId) {
		clearTimeout(this.playingTimerId);
		this.currentSource.stop(0);
		this.currentSource.disconnect(0);
		this.currentSource = null;
		this.playingTimerId = null;
		this.startOffset = this.audioContext.currentTime - this.startTime;
	    }
	}
	else {
	    // HTML5 Audio
	    if(this.currentAudio) {
		this.currentAudio.pause();
	    }
	}
	this.state = WebAudio.PAUSING_STATE;
    }
}

WebAudio.prototype.resume = function() {
    if(this.state == WebAudio.PAUSING_STATE) {
	if(this.currentIntervalTime) {
	    setTimeout(this.intervalTimeoutFunction,
		       this.currentIntervalTime);
	}
	else if(this.useWebAudioApi()) {
	    // Web Audio API
	    if(this.currentBuffer && this.startOffset != undefined) {
		this.playBuffer(this.currentBuffer,
				this.playFinishedHandler,
				this.startOffset);
	    }
	}
	else {
	    // HTML5 Audio
	    if(this.currentAudio) {
		this.currentAudio.play();
		this.state = WebAudio.PLAYING_STATE;
	    }
	}
    }
}

WebAudio.prototype.replayCurrentListItem = function() {
    if(this.currentPlaylist) {
	this.pause();
	var item = this.currentPlaylist[this.currentPlaylistIndex];
	while($.isNumeric(item)) {
	    if(this.currentPlaylistIndex > 0) {
		this.currentPlaylistIndex--;
		item = this.currentPlaylist[this.currentPlaylistIndex];
		this.currentIntervalTime = null;
	    }
	    else {
		// プレイリストの先頭→そのまま再生
		this.resume();
		return;
	    }
	}
	this.playListItem();
    }
}

WebAudio.prototype.playPrevListItem = function() {
    if(this.currentPlaylist) {
	this.pause();
	this.currentIntervalTime = null
	this.currentPlaylistIndex -= 2;
	if(this.currentPlaylistIndex < 0) {
	    this.currentPlaylistIndex = 0;
	}
	var item = this.currentPlaylist[this.currentPlaylistIndex];
	while($.isNumeric(item)) {
	    if(this.currentPlaylistIndex > 0) {
		this.currentPlaylistIndex--;
		item = this.currentPlaylist[this.currentPlaylistIndex];
	    }
	    else {
		// プレイリストの先頭→そのまま再生
		this.resume();
		return;
	    }
	}
	this.playListItem();
    }
}

WebAudio.prototype.playNextListItem = function() {
    if(this.currentPlaylist) {
	this.pause();
	this.currentIntervalTime = null;
	if(this.currentPlaylistIndex >= this.currentPlaylist.length - 1) {
	    // プレイリストの終端
	    return;
	} 
	this.currentPlaylistIndex++;
	var item = this.currentPlaylist[this.currentPlaylistIndex];
	while($.isNumeric(item)) {
	    if(this.currentPlaylistIndex >= this.currentPlaylist.length - 1) {
		// プレイリストの終端
		return;
	    }
	    this.currentPlaylistIndex++;
	    item = this.currentPlaylist[this.currentPlaylistIndex];
	}
	if(this.useWebAudioApi()) {
	    this.loadUrl(item, function() {
		WebAudio.instance().playListItem();
	    });
	}
	else {
	    $(this.currentAudio).unbind("ended");
	    WebAudio.instance().playListItem();
	}
    }
}

WebAudio.prototype.isPlaying = function () {
    return (this.state == WebAudio.PLAYING_STATE);
}

WebAudio.prototype.isStopping = function() {
    return (this.state == WebAudio.STOPPING_STATE);
}

WebAudio.prototype.isPausing = function() {
    return (this.state == WebAudio.PAUSING_STATE);
}

WebAudio.prototype.destroyBufferByUrl = function(url) {
    // destroy a buffer specified by url
    if(this.loadedBuffers[url]) {
	this.loadedBuffers[url] = null;
    }
}

WebAudio.prototype.clearBuffers = function() {
    // destroy all buffers
    this.loadedBuffers = {};
}

function BufferLoader(context, urlList, callback) {
    this.context = context;
    this.urlList = urlList;
    this.onload = callback;
    this.bufferList = new Array();
    this.loadCount = 0;
}

BufferLoader.prototype.loadBuffer = function(url, index) {
    // Load buffer asynchronously
    var request = new XMLHttpRequest();
    request.open("GET", url, true);
    request.responseType = "arraybuffer";
    
    var loader = this;
    
    request.onload = function() {
	// Asynchronously decode the audio file data in request.response
	loader.context.decodeAudioData(
	    request.response,
	    function(buffer) {
		if (!buffer) {
		    alert('error decoding file data: ' + url);
		    return;
		}
		loader.bufferList[index] = buffer;
		if (++loader.loadCount == loader.urlList.length)
		    loader.onload(loader.bufferList);
	    },
	    function(error) {
		console.error('decodeAudioData error', error);
	    }
	);
    }
    
    request.onerror = function() {
	alert('BufferLoader: XHR error');
    }
    
    request.send();
};

BufferLoader.prototype.load = function() {
    for (var i = 0; i < this.urlList.length; ++i)
	this.loadBuffer(this.urlList[i], i);
};
