import PropTypes from "prop-types";
import React, { Component, createRef } from "react";
import {
  View,
  TouchableOpacity,
  Dimensions,
  Modal,
  Platform,
  Animated,
  DeviceEventEmitter,
  ViewPropTypes,
  FlatList,
  Keyboard,
  TextInput,
  UIManager,
  StatusBar,
  findNodeHandle,
} from "react-native";
import { styles } from "./styles";

var deviceHeight = getDeviceHeight();

function getDeviceHeight(statusBarTranslucent) {
  var height = Dimensions.get("window").height;

  if (Platform.OS === "android" && !statusBarTranslucent) {
    return height - StatusBar.currentHeight;
  }

  return height;
}

const getElevation = (elevation) => {
  return {
    elevation,
    shadowColor: "black",
    shadowOffset: { width: 0.3 * elevation, height: 0.5 * elevation },
    shadowOpacity: 0.2,
    shadowRadius: 0.7 * elevation,
  };
};

const SUPPORTED_ORIENTATIONS = [
  "portrait",
  "portrait-upside-down",
  "landscape",
  "landscape-left",
  "landscape-right",
];

export default class ActionSheet extends Component {
  constructor(props) {
    super(props);
    this.state = {
      modalVisible: false,
      scrollable: false,
      layoutHasCalled: false,
      keyboard: false,
      deviceHeight: getDeviceHeight(this.props.statusBarTranslucent),
      deviceWidth: Dimensions.get("window").width,
      portrait:true
    };
    this.transformValue = new Animated.Value(0);
    this.opacityValue = new Animated.Value(0);
    this.customComponentHeight;
    this.prevScroll;
    this.scrollAnimationEndValue;
    this.hasBounced;
    this.scrollViewRef = createRef();
    this.layoutHasCalled = false;
    this.isClosing = false;
    this.isRecoiling = false;
    this.targetId = null;
    this.offsetY = 0;
    this.borderRadius = new Animated.Value(10);
    this.currentOffsetFromBottom = this.props.initialOffsetFromBottom;
  }

  waitAsync = (ms) =>
    new Promise((resolve, reject) => {
      setTimeout(() => {
        resolve();
      }, ms);
    });

  /**
   * Snap ActionSheet to Offset
   */

  snapToOffset = (offset) => {
    this._scrollTo(offset);
  };

  // Open the ActionSheet
  show = () => {
    this.setModalVisible(true);
  };

  // Close the ActionSheet
  hide = () => {
    this.setModalVisible(false);
  };

  /**
   * Open/Close the ActionSheet
   */
  setModalVisible = (visible) => {
    deviceHeight = getDeviceHeight(this.props.statusBarTranslucent);
    let modalVisible = this.state.modalVisible;
    if (visible !== undefined) {
      if (modalVisible === visible) {
        return;
      }
      modalVisible = !visible;
    }
    if (!modalVisible) {
      this.setState({
        modalVisible: true,
        scrollable: this.props.gestureEnabled,
      });
    } else {
      this._hideModal();
    }
  };

  _hideAnimation() {
    let {
      animated,
      closeAnimationDuration,
      onClose,
      bottomOffset,
      initialOffsetFromBottom,
      extraScroll,
      closable
    } = this.props;

    Animated.parallel([
      Animated.timing(this.opacityValue, {
        toValue: closable ? 0 : 1,
        duration: animated ? closeAnimationDuration : 1,
        useNativeDriver: true,
      }),
      Animated.timing(this.transformValue, {
        toValue: closable ? this.customComponentHeight * 2 : 0,
        duration: animated ? closeAnimationDuration : 1,
        useNativeDriver: true,
      }),
    ]).start();

    this.waitAsync(closeAnimationDuration / 1.5).then(() => {
      let scrollOffset = closable
        ? 0
        : this.customComponentHeight * initialOffsetFromBottom +
          this.state.deviceHeight * 0.1 +
          extraScroll -
          bottomOffset;

      this._scrollTo(scrollOffset, !closable);

      this.setState(
        {
          modalVisible: !closable,
        },
        () => {
          this.isClosing = false;
          DeviceEventEmitter.emit('hasReachedTop', false);
          if (closable) {
            this.layoutHasCalled = false;
            if (typeof onClose === 'function') onClose();
          }
        },
      );
    });
  }

  _hideModal = () => {
    if (this.isClosing) return;
    this.isClosing = true;
    this._hideAnimation();
  };

  _showModal = async (event) => {
    let {
      gestureEnabled,
      initialOffsetFromBottom,
      extraScroll,
      delayActionSheetDraw,
      delayActionSheetDrawTime,
    } = this.props;
    
    let height = event.nativeEvent.layout.height;

    if (this.layoutHasCalled) {

      this._returnToPrevScrollPosition(height);
      this.customComponentHeight = height;
    
      return;
    } else {
      this.customComponentHeight = height;
      this._applyHeightLimiter();
      let correction = this.state.deviceHeight * 0.1;

      let scrollOffset = gestureEnabled
        ? this.customComponentHeight * initialOffsetFromBottom +
          correction +
          extraScroll
        : this.customComponentHeight + correction + extraScroll;
      
      if (Platform.OS === 'ios') {
        await this.waitAsync(delayActionSheetDrawTime);
      } else {
        if (delayActionSheetDraw) {
          await this.waitAsync(delayActionSheetDrawTime);
        }
      }
      this._scrollTo(scrollOffset, false);
      this.prevScroll = scrollOffset;
      if (Platform.OS === 'ios') {
        await this.waitAsync(delayActionSheetDrawTime / 2);
      } else {
        if (delayActionSheetDraw) {
          await this.waitAsync(delayActionSheetDrawTime / 2);
        }
      }
      this._openAnimation(scrollOffset);
      if (!gestureEnabled) {
        DeviceEventEmitter.emit('hasReachedTop');
      }
      this.layoutHasCalled = true;
    }
  };

  _openAnimation = (scrollOffset) => {
    let {bounciness, bounceOnOpen, animated, openAnimationSpeed} = this.props;

    if (animated) {
      this.transformValue.setValue(scrollOffset);
      Animated.parallel([
        Animated.spring(this.transformValue, {
          toValue: 0,
          bounciness: bounceOnOpen ? bounciness : 1,
          speed: openAnimationSpeed,
          useNativeDriver: true,
        }),
        Animated.timing(this.opacityValue, {
          toValue: 1,
          duration: 150,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      this.opacityValue.setValue(1);
    }
  };

  _onScrollBegin = async (event) => {};
  _onScrollBeginDrag = async (event) => {
    let verticalOffset = event.nativeEvent.contentOffset.y;
    this.prevScroll = verticalOffset;
  };

  
  _applyHeightLimiter() {
    if (this.customComponentHeight > this.state.deviceHeight) {
      this.customComponentHeight =
        (this.customComponentHeight -
          (this.customComponentHeight - this.state.deviceHeight)) *
        1;
    }
  }

  _onScrollEnd = async (event) => {
    let {springOffset, extraScroll} = this.props;
    let verticalOffset = event.nativeEvent.contentOffset.y;
    if (this.isRecoiling) return;

    if (this.prevScroll < verticalOffset) {
      if (verticalOffset - this.prevScroll > springOffset * 0.75) {
        this.isRecoiling = true;

        this._applyHeightLimiter();
        let correction = this.state.deviceHeight * 0.1;
        let scrollValue = this.customComponentHeight + correction + extraScroll;

        this._scrollTo(scrollValue);
        await this.waitAsync(300);
        this.isRecoiling = false;
        this.currentOffsetFromBottom = 1;
        DeviceEventEmitter.emit('hasReachedTop', true);
      } else {
        this._returnToPrevScrollPosition(this.customComponentHeight);
      }
    } else {
      if (this.prevScroll - verticalOffset > springOffset) {
        this._hideModal();
      } else {
        if (this.isRecoiling) {
          return;
        }
        this.isRecoiling = true;
        this._returnToPrevScrollPosition(this.customComponentHeight);
        await this.waitAsync(300);
        this.isRecoiling = false;
      }
    }
  };

  _returnToPrevScrollPosition(height) {
    let offset =
      height * this.currentOffsetFromBottom +
      this.state.deviceHeight * 0.1 +
      this.props.extraScroll;
    this._scrollTo(offset);
  }

  _scrollTo = (y, animated = true) => {
    this.scrollAnimationEndValue = y;
    this.prevScroll = y;
    this.scrollViewRef.current?._listRef._scrollRef.scrollTo({
      x: 0,
      y: this.scrollAnimationEndValue,
      animated: animated,
    });
  };

  _onTouchMove = () => {
    if (this.props.closeOnTouchBackdrop) {
      this._hideModal();
    }
    this.setState({
      scrollable: false,
    });
  };

  _onTouchStart = () => {
    if (this.props.closeOnTouchBackdrop) {
      this._hideModal();
    }
    this.setState({
      scrollable: false,
    });
  };

  _onTouchEnd = () => {
    if (this.props.gestureEnabled) {
      this.setState({
        scrollable: true,
      });
    }
  };

  getTarget = () => {
    return this.targetId;
  };

  _onScroll = (event) => {
    this.targetId = event.nativeEvent.target;
    this.offsetY = event.nativeEvent.contentOffset.y;

    let correction = this.state.deviceHeight * 0.1;
    if (this.customComponentHeight + correction - this.offsetY < 50) {
      DeviceEventEmitter.emit('hasReachedTop', true);
    } else {
      DeviceEventEmitter.emit('hasReachedTop', false);
    }
  };

  _onRequestClose = () => {
    if (this.props.closeOnPressBack) this._hideModal();
  };

  _onTouchBackdrop = () => {
    if (this.props.closeOnTouchBackdrop) {
      this._hideModal();
    }
  };

  componentDidMount() {
    Keyboard.addListener(
      Platform.OS === "android" ? "keyboardDidShow" : "keyboardWillShow",
      this._onKeyboardShow
    );

    Keyboard.addListener(
      Platform.OS === "android" ? "keyboardDidHide" : "keyboardWillHide",
      this._onKeyboardHide
    );
  }

  _onKeyboardShow = (e) => {
    this.setState({
      keyboard: true,
    });
    const ReactNativeVersion = require("react-native/Libraries/Core/ReactNativeVersion");

    let v = ReactNativeVersion.version.major + ReactNativeVersion.version.minor;
    v = parseInt(v);

    if (v >= 63 || Platform.OS === "ios") {
      let keyboardHeight = e.endCoordinates.height;
      const { height: windowHeight } = Dimensions.get("window");

      const currentlyFocusedField = TextInput.State.currentlyFocusedInput
        ? findNodeHandle(TextInput.State.currentlyFocusedInput())
        : TextInput.State.currentlyFocusedField();

      if (!currentlyFocusedField) {
        return;
      }

      UIManager.measure(
        currentlyFocusedField,
        (originX, originY, width, height, pageX, pageY) => {
          const fieldHeight = height;
          const fieldTop = pageY;
          const gap = windowHeight - keyboardHeight - (fieldTop + fieldHeight);
          if (gap >= 0) {
            return;
          }
          Animated.timing(this.transformValue, {
            toValue: gap - 10,
            duration: 250,
            useNativeDriver: true,
          }).start();
        }
      );
    } else {
      Animated.timing(this.transformValue, {
        toValue: -10,
        duration: 250,
        useNativeDriver: true,
      }).start();
    }
  };

  /**
   * Attach this to any child ScrollView Component's onScrollEndDrag,
   * onMomentumScrollEnd,onScrollAnimationEnd callbacks to handle the ActionSheet
   * closing and bouncing back properly.
   */

  handleChildScrollEnd = () => {
    if (this.offsetY > this.prevScroll) return;
    if (this.prevScroll - this.props.springOffset > this.offsetY) {
      this._hideModal();
    } else {
      this.isRecoiling = true;
      this._scrollTo(this.prevScroll,true);
      setTimeout(() => {
        this.isRecoiling = false;
      },150);
    }
  };

  _onKeyboardHide = () => {
    this.setState({
      keyboard: false,
    });
    Animated.timing(this.transformValue, {
      toValue: 0,
      duration: 100,
      useNativeDriver: true,
    }).start();
  };

  componentWillUnmount() {
    Keyboard.removeListener(
      Platform.OS === "android" ? "keyboardDidShow" : "keyboardWillShow",
      this._onKeyboardShow
    );

    Keyboard.removeListener(
      Platform.OS === "android" ? "keyboardDidHide" : "keyboardWillHide",
      this._onKeyboardHide
    );
  }

  _onDeviceLayout = (event) => {
    let height = event.nativeEvent.layout.height;
    if (this.props.statusBarTranslucent && Platform.OS === "android") {
      height = height - StatusBar.currentHeight;
    }
    let width = event.nativeEvent.layout.width

    this.setState({
      deviceHeight: height,
      deviceWidth: width,
      portrait: height > width ,
    });
  };

  render() {
    let { scrollable, modalVisible, keyboard } = this.state;
    let {
      testID,
      onOpen,
      overlayColor,
      gestureEnabled,
      elevation,
      indicatorColor,
      defaultOverlayOpacity,
      children,
      containerStyle,
      CustomHeaderComponent,
      headerAlwaysVisible,
      keyboardShouldPersistTaps,
      statusBarTranslucent,
    } = this.props;

    return (
      <Modal
        visible={modalVisible}
        animationType="none"
        testID={testID}
        supportedOrientations={SUPPORTED_ORIENTATIONS}
        onShow={onOpen}
        onRequestClose={this._onRequestClose}
        transparent={true}
        statusBarTranslucent={statusBarTranslucent}>
        <Animated.View
          onLayout={this._onDeviceLayout}
          style={[
            styles.parentContainer,
            {
              opacity: this.opacityValue,
              width: '100%',
            },
          ]}>
          {this.props.premium}
          <FlatList
            bounces={false}
            keyboardShouldPersistTaps={keyboardShouldPersistTaps}
            ref={this.scrollViewRef}
            scrollEventThrottle={1}
            showsVerticalScrollIndicator={false}
            onMomentumScrollBegin={this._onScrollBegin}
            onMomentumScrollEnd={this._onScrollEnd}
            scrollEnabled={scrollable && !keyboard}
            onScrollBeginDrag={this._onScrollBeginDrag}
            onScrollEndDrag={this._onScrollEnd}
            onTouchEnd={this._onTouchEnd}
            onScroll={this._onScroll}
            style={styles.scrollView}
            contentContainerStyle={{
              width: this.state.deviceWidth,
            }}
            data={['dummy']}
            keyExtractor={(item) => item}
            renderItem={({item, index}) => (
              <View
                style={{
                  width: '100%',
                }}>
                <Animated.View
                  onTouchStart={this._onTouchBackdrop}
                  onTouchMove={this._onTouchBackdrop}
                  onTouchEnd={this._onTouchBackdrop}
                  style={{
                    height: '100%',
                    width: '100%',
                    position: 'absolute',
                    zIndex: 1,
                    backgroundColor: overlayColor,
                    opacity: defaultOverlayOpacity,
                  }}
                />
                <View
                  onTouchMove={this._onTouchMove}
                  onTouchStart={this._onTouchStart}
                  onTouchEnd={this._onTouchEnd}
                  style={{
                    height: this.state.deviceHeight * 1.1,
                    width: '100%',
                    zIndex: 10,
                  }}>
                  <TouchableOpacity
                    onPress={this._onTouchBackdrop}
                    onLongPress={this._onTouchBackdrop}
                    style={{
                      height: this.state.deviceHeight * 1.1,
                      width: '100%',
                    }}
                  />
                </View>

                <Animated.View
                  onLayout={this._showModal}
                  style={[
                    styles.container,
                    containerStyle,
                    {
                      ...getElevation(elevation),
                      zIndex: 11,
                      opacity: this.opacityValue,
                      transform: [
                        {
                          translateY: this.transformValue,
                        },
                      ],
                      borderTopRightRadius: this.borderRadius,
                      borderTopLeftRadius: this.borderRadius,
                      maxHeight: this.state.deviceHeight,
                    },
                  ]}>
                  {gestureEnabled || headerAlwaysVisible ? (
                    CustomHeaderComponent ? (
                      CustomHeaderComponent
                    ) : (
                      <View
                        style={[
                          styles.indicator,
                          {backgroundColor: indicatorColor},
                        ]}
                      />
                    )
                  ) : null}

                  {children}
                </Animated.View>
              </View>
            )}
          />
        </Animated.View>
      </Modal>
    );
  }
}

ActionSheet.defaultProps = {
  testID: "actionSheetTest",
  children: <View />,
  CustomHeaderComponent: null,
  headerAlwaysVisible: false,
  containerStyle: {},
  animated: true,
  closeOnPressBack: true,
  gestureEnabled: false,
  bounceOnOpen: false,
  bounciness: 8,
  extraScroll: 0,
  closeAnimationDuration: 300,
  delayActionSheetDraw: false,
  delayActionSheetDrawTime: 50,
  openAnimationSpeed: 12,
  springOffset: 100,
  elevation: 5,
  initialOffsetFromBottom: 1,
  indicatorColor: "#f0f0f0",
  defaultOverlayOpacity: 0.3,
  overlayColor: "black",
  closable: true,
  bottomOffset: 0,
  closeOnTouchBackdrop: true,
  onClose: () => {},
  onOpen: () => {},
  keyboardShouldPersistTaps: "never",
  statusBarTranslucent: true,
};
ActionSheet.propTypes = {
  testID: PropTypes.string,
  children: PropTypes.node,
  CustomHeaderComponent: PropTypes.node,
  extraScroll: PropTypes.number,
  headerAlwaysVisible: PropTypes.bool,
  containerStyle: ViewPropTypes.style,
  animated: PropTypes.bool,
  closeOnPressBack: PropTypes.bool,
  delayActionSheetDraw: PropTypes.bool,
  delayActionSheetDrawTime: PropTypes.number,
  gestureEnabled: PropTypes.bool,
  closeOnTouchBackdrop: PropTypes.bool,
  bounceOnOpen: PropTypes.bool,
  bounciness: PropTypes.number,
  springOffset: PropTypes.number,
  defaultOverlayOpacity: PropTypes.number,
  closeAnimationDuration: PropTypes.number,
  openAnimationSpeed: PropTypes.number,
  elevation: PropTypes.number,
  initialOffsetFromBottom: PropTypes.number,
  indicatorColor: PropTypes.string,
  closable: PropTypes.bool,
  bottomOffset: PropTypes.number,
  overlayColor: PropTypes.string,
  onClose: PropTypes.func,
  onOpen: PropTypes.func,
  keyboardShouldPersistTaps: PropTypes.oneOf(["always", "default", "never"]),
  statusBarTranslucent: PropTypes.bool,
};
