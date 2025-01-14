import React, { Component } from 'react';
import { defineMessages, injectIntl } from 'react-intl';
import browserInfo from '/imports/utils/browserInfo';
import { Meteor } from 'meteor/meteor';
import PropTypes from 'prop-types';
import BBBMenu from '/imports/ui/components/common/menu/component';
import FullscreenService from '/imports/ui/components/common/fullscreen-button/service';
import FullscreenButtonContainer from '/imports/ui/components/common/fullscreen-button/container';
import Styled from './styles';
import VideoService from '../../service';
import {
  isStreamStateUnhealthy,
  subscribeToStreamStateChange,
  unsubscribeFromStreamStateChange,
} from '/imports/ui/services/bbb-webrtc-sfu/stream-state-service';
import { ACTIONS } from '/imports/ui/components/layout/enums';
import Settings from '/imports/ui/services/settings';

const ALLOW_FULLSCREEN = Meteor.settings.public.app.allowFullscreen;
const { isSafari } = browserInfo;
const FULLSCREEN_CHANGE_EVENT = isSafari ? 'webkitfullscreenchange' : 'fullscreenchange';

const intlMessages = defineMessages({
  focusLabel: {
    id: 'app.videoDock.webcamFocusLabel',
  },
  focusDesc: {
    id: 'app.videoDock.webcamFocusDesc',
  },
  unfocusLabel: {
    id: 'app.videoDock.webcamUnfocusLabel',
  },
  unfocusDesc: {
    id: 'app.videoDock.webcamUnfocusDesc',
  },
  pinLabel: {
    id: 'app.videoDock.webcamPinLabel',
  },
  pinDesc: {
    id: 'app.videoDock.webcamPinDesc',
  },
  unpinLabel: {
    id: 'app.videoDock.webcamUnpinLabel',
  },
  unpinLabelDisabled: {
    id: 'app.videoDock.webcamUnpinLabelDisabled',
  },
  unpinDesc: {
    id: 'app.videoDock.webcamUnpinDesc',
  },
  mirrorLabel: {
    id: 'app.videoDock.webcamMirrorLabel',
  },
  mirrorDesc: {
    id: 'app.videoDock.webcamMirrorDesc',
  },
});

class VideoListItem extends Component {
  constructor(props) {
    super(props);
    this.videoTag = null;

    this.state = {
      videoIsReady: false,
      isFullscreen: false,
      isStreamHealthy: false,
      isMirrored: VideoService.mirrorOwnWebcam(props.userId),
    };

    this.mirrorOwnWebcam = VideoService.mirrorOwnWebcam(props.userId);

    this.setVideoIsReady = this.setVideoIsReady.bind(this);
    this.onFullscreenChange = this.onFullscreenChange.bind(this);
    this.onStreamStateChange = this.onStreamStateChange.bind(this);
  }

  componentDidMount() {
    const { onVideoItemMount, cameraId } = this.props;

    onVideoItemMount(this.videoTag);
    this.videoTag.addEventListener('loadeddata', this.setVideoIsReady);
    this.videoContainer.addEventListener(FULLSCREEN_CHANGE_EVENT, this.onFullscreenChange);
    subscribeToStreamStateChange(cameraId, this.onStreamStateChange);
  }

  componentDidUpdate() {
    const playElement = (elem) => {
      if (elem.paused) {
        elem.play().catch((error) => {
          // NotAllowedError equals autoplay issues, fire autoplay handling event
          if (error.name === 'NotAllowedError') {
            const tagFailedEvent = new CustomEvent('videoPlayFailed', { detail: { mediaTag: elem } });
            window.dispatchEvent(tagFailedEvent);
          }
        });
      }
    };

    // This is here to prevent the videos from freezing when they're
    // moved around the dom by react, e.g., when  changing the user status
    // see https://bugs.chromium.org/p/chromium/issues/detail?id=382879
    if (this.videoTag) {
      playElement(this.videoTag);
    }
  }

  componentWillUnmount() {
    const {
      cameraId,
      onVideoItemUnmount,
      isFullscreenContext,
      layoutContextDispatch,
    } = this.props;

    this.videoTag.removeEventListener('loadeddata', this.setVideoIsReady);
    this.videoContainer.removeEventListener(FULLSCREEN_CHANGE_EVENT, this.onFullscreenChange);
    unsubscribeFromStreamStateChange(cameraId, this.onStreamStateChange);
    onVideoItemUnmount(cameraId);

    if (isFullscreenContext) {
      layoutContextDispatch({
        type: ACTIONS.SET_FULLSCREEN_ELEMENT,
        value: {
          element: '',
          group: '',
        },
      });
    }
  }

  onStreamStateChange(e) {
    const { streamState } = e.detail;
    const { isStreamHealthy } = this.state;

    const newHealthState = !isStreamStateUnhealthy(streamState);
    e.stopPropagation();

    if (newHealthState !== isStreamHealthy) {
      this.setState({ isStreamHealthy: newHealthState });
    }
  }

  onFullscreenChange() {
    const { isFullscreen } = this.state;
    const serviceIsFullscreen = FullscreenService.isFullScreen(this.videoContainer);

    if (isFullscreen !== serviceIsFullscreen) {
      this.setState({ isFullscreen: serviceIsFullscreen });
    }
  }

  setVideoIsReady() {
    const { videoIsReady } = this.state;
    if (!videoIsReady) this.setState({ videoIsReady: true });
    window.dispatchEvent(new Event('resize'));

    /* used when re-sharing cameras after leaving a breakout room.
    it is needed in cases where the user has more than one active camera
    so we only share the second camera after the first
    has finished loading (can't share more than one at the same time) */
    Session.set('canConnect', true);
  }

  getAvailableActions() {
    const {
      intl,
      cameraId,
      numOfStreams,
      onHandleVideoFocus,
      user,
      focused,
    } = this.props;

    const pinned = user?.pin;
    const userId = user?.userId;

    const isPinnedIntlKey = !pinned ? 'pin' : 'unpin';
    const isFocusedIntlKey = !focused ? 'focus' : 'unfocus';

    const menuItems = [{
      key: `${cameraId}-mirror`,
      label: intl.formatMessage(intlMessages.mirrorLabel),
      description: intl.formatMessage(intlMessages.mirrorDesc),
      onClick: () => this.mirrorCamera(cameraId),
    }];

    if (numOfStreams > 2) {
      menuItems.push({
        key: `${cameraId}-focus`,
        label: intl.formatMessage(intlMessages[`${isFocusedIntlKey}Label`]),
        description: intl.formatMessage(intlMessages[`${isFocusedIntlKey}Desc`]),
        onClick: () => onHandleVideoFocus(cameraId),
      });
    }

    if (VideoService.isVideoPinEnabledForCurrentUser()) {
      menuItems.push({
        key: `${cameraId}-pin`,
        label: intl.formatMessage(intlMessages[`${isPinnedIntlKey}Label`]),
        description: intl.formatMessage(intlMessages[`${isPinnedIntlKey}Desc`]),
        onClick: () => VideoService.toggleVideoPin(userId, pinned),
      });
    }

    return menuItems;
  }

  mirrorCamera() {
    const { isMirrored } = this.state;
    this.setState({ isMirrored: !isMirrored });
  }

  renderFullscreenButton() {
    const { name, cameraId } = this.props;
    const { isFullscreen } = this.state;

    if (!ALLOW_FULLSCREEN) return null;

    return (
      <FullscreenButtonContainer
        data-test="webcamsFullscreenButton"
        fullscreenRef={this.videoContainer}
        elementName={name}
        elementId={cameraId}
        elementGroup="webcams"
        isFullscreen={isFullscreen}
        dark
      />
    );
  }

  renderPinButton() {
    const { user, intl } = this.props;
    const pinned = user?.pin;
    const userId = user?.userId;
    const shouldRenderPinButton = pinned && userId;
    const videoPinActionAvailable = VideoService.isVideoPinEnabledForCurrentUser();

    if (!shouldRenderPinButton) return null;

    return (
      <Styled.PinButtonWrapper>
        <Styled.PinButton
          color="default"
          icon={!pinned ? 'pin-video_on' : 'pin-video_off'}
          size="sm"
          onClick={() => VideoService.toggleVideoPin(userId, true)}
          label={videoPinActionAvailable
            ? intl.formatMessage(intlMessages.unpinLabel)
            : intl.formatMessage(intlMessages.unpinLabelDisabled)}
          hideLabel
          disabled={!videoPinActionAvailable}
          data-test="pinVideoButton"
        />
      </Styled.PinButtonWrapper>
    );
  }

  render() {
    const {
      videoIsReady,
      isStreamHealthy,
      isMirrored,
    } = this.state;
    const {
      name,
      user,
      voiceUser,
      numOfStreams,
      isFullscreenContext,
    } = this.props;
    const availableActions = this.getAvailableActions();
    const enableVideoMenu = Meteor.settings.public.kurento.enableVideoMenu || false;
    const shouldRenderReconnect = !isStreamHealthy && videoIsReady;

    const { isFirefox } = browserInfo;
    const { animations } = Settings.application;
    const talking = voiceUser?.talking;
    const listenOnly = voiceUser?.listenOnly;
    const muted = voiceUser?.muted;
    const voiceUserJoined = voiceUser?.joined;
    
    return (
      <Styled.Content
        talking={talking}
        fullscreen={isFullscreenContext}
        data-test={talking ? 'webcamItemTalkingUser' : 'webcamItem'}
        animations={animations}
      >
        {
          !videoIsReady
          && (
            <Styled.WebcamConnecting
              data-test="webcamConnecting"
              talking={talking}
              animations={animations}
            >
              <Styled.LoadingText>{name}</Styled.LoadingText>
            </Styled.WebcamConnecting>
          )

        }

        {
          shouldRenderReconnect
          && <Styled.Reconnecting />
        }

        <Styled.VideoContainer ref={(ref) => { this.videoContainer = ref; }}>
          <Styled.Video
            muted
            data-test={this.mirrorOwnWebcam ? 'mirroredVideoContainer' : 'videoContainer'}
            mirrored={isMirrored}
            unhealthyStream={shouldRenderReconnect}
            ref={(ref) => { this.videoTag = ref; }}
            autoPlay
            playsInline
          />
          {videoIsReady && this.renderFullscreenButton()}
          {videoIsReady && this.renderPinButton()}
        </Styled.VideoContainer>
        {videoIsReady
          && (
            <Styled.Info>
              {enableVideoMenu && availableActions.length >= 1
                ? (
                  <BBBMenu
                    trigger={<Styled.DropdownTrigger tabIndex={0} data-test="dropdownWebcamButton">{name}</Styled.DropdownTrigger>}
                    actions={this.getAvailableActions()}
                    opts={{
                      id: "default-dropdown-menu",
                      keepMounted: true,
                      transitionDuration: 0,
                      elevation: 3,
                      getContentAnchorEl: null,
                      fullwidth: "true",
                      anchorOrigin: { vertical: 'bottom', horizontal: 'left' },
                      transformorigin: { vertical: 'bottom', horizontal: 'left' },
                    }}
                  />
                )
                : (
                  <Styled.Dropdown isFirefox={isFirefox}>
                    <Styled.UserName noMenu={numOfStreams < 3}>
                      {name}
                    </Styled.UserName>
                  </Styled.Dropdown>
                )}
              {muted && !listenOnly ? <Styled.Muted iconName="unmute_filled" /> : null}
              {listenOnly ? <Styled.Voice iconName="listen" /> : null}
              {voiceUserJoined && !muted ? <Styled.Voice iconName="unmute" /> : null}
            </Styled.Info>
          )}
      </Styled.Content>
    );
  }
}

export default injectIntl(VideoListItem);

VideoListItem.defaultProps = {
  numOfStreams: 0,
  user: null,
};

VideoListItem.propTypes = {
  cameraId: PropTypes.string.isRequired,
  name: PropTypes.string.isRequired,
  numOfStreams: PropTypes.number,
  intl: PropTypes.shape({
    formatMessage: PropTypes.func.isRequired,
  }).isRequired,
  onHandleVideoFocus: PropTypes.func.isRequired,
  user: PropTypes.shape({
    pin: PropTypes.bool.isRequired,
    userId: PropTypes.string.isRequired,
  }).isRequired,
  voiceUser:  PropTypes.shape({
    muted: PropTypes.bool.isRequired,
    listenOnly: PropTypes.bool.isRequired,
    talking: PropTypes.bool.isRequired,
  }).isRequired,
  focused: PropTypes.bool.isRequired,
};
