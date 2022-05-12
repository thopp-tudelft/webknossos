import { Row, Col, Slider, InputNumber, Switch, Tooltip, Input, Select, Popover } from "antd";
import { DeleteOutlined, DownloadOutlined, EditOutlined, ScanOutlined } from "@ant-design/icons";
import * as React from "react";
import _ from "lodash";
import type { Vector3, Vector6 } from "oxalis/constants";
import * as Utils from "libs/utils";
import features from "features";
import messages from "messages";
const rowGutter = {
  xs: 8,
  sm: 16,
  md: 16,
  lg: 16,
};
type NumberSliderSettingProps = {
  onChange: (value: number) => void;
  value: number;
  label: string | React.ReactNode;
  max: number;
  min: number;
  step: number;
  disabled: boolean;
};
export class NumberSliderSetting extends React.PureComponent<NumberSliderSettingProps> {
  static defaultProps = {
    min: 1,
    step: 1,
    disabled: false,
  };

  _onChange = (_value: number) => {
    if (this.isValueValid(_value)) {
      this.props.onChange(_value);
    }
  };

  isValueValid = (_value: number) =>
    _.isNumber(_value) && _value >= this.props.min && _value <= this.props.max;

  render() {
    const { value: originalValue, label, max, min, step, onChange, disabled } = this.props;
    // Validate the provided value. If it's not valid, fallback to the midpoint between min and max.
    // This check guards against broken settings which could be introduced before this component
    // checked more thoroughly against invalid values.
    const value = this.isValueValid(originalValue) ? originalValue : Math.floor((min + max) / 2);
    return (
      <Row align="middle" gutter={rowGutter}>
        <Col span={9}>
          <label className="setting-label">{label}</label>
        </Col>
        <Col span={9}>
          <Slider
            min={min}
            max={max}
            onChange={onChange}
            value={value}
            step={step}
            disabled={disabled}
          />
        </Col>
        <Col span={6}>
          <InputNumber
            min={min}
            max={max}
            style={{
              width: "100%",
            }}
            value={value}
            onChange={this._onChange}
            size="small"
            disabled={disabled}
          />
        </Col>
      </Row>
    );
  }
}
type LogSliderSettingProps = {
  onChange: (value: number) => void;
  value: number;
  label: string | React.ReactNode;
  max: number;
  min: number;
  roundTo: number;
  disabled?: boolean;
  spans: [number, number, number];
};
const LOG_SLIDER_MIN = -100;
const LOG_SLIDER_MAX = 100;
export class LogSliderSetting extends React.PureComponent<LogSliderSettingProps> {
  static defaultProps = {
    disabled: false,
    roundTo: 3,
    spans: [9, 9, 6],
  };

  onChangeInput = (value: number) => {
    if (this.props.min <= value && value <= this.props.max) {
      this.props.onChange(value);
    } else {
      // reset to slider value
      this.props.onChange(this.props.value);
    }
  };

  onChangeSlider = (value: number) => {
    this.props.onChange(this.calculateValue(value));
  };

  calculateValue(value: number) {
    const a = 200 / (Math.log(this.props.max) - Math.log(this.props.min));
    const b =
      (100 * (Math.log(this.props.min) + Math.log(this.props.max))) /
      (Math.log(this.props.min) - Math.log(this.props.max));
    return Math.exp((value - b) / a);
  }

  formatTooltip = (value: number) => {
    const calculatedValue = this.calculateValue(value);
    return calculatedValue >= 10000
      ? calculatedValue.toExponential()
      : Utils.roundTo(calculatedValue, this.props.roundTo);
  };

  getSliderValue = () => {
    const a = 200 / (Math.log(this.props.max) - Math.log(this.props.min));
    const b =
      (100 * (Math.log(this.props.min) + Math.log(this.props.max))) /
      (Math.log(this.props.min) - Math.log(this.props.max));
    const scaleValue = a * Math.log(this.props.value) + b;
    return Math.round(scaleValue);
  };

  render() {
    const { label, roundTo, value, min, max, disabled, spans } = this.props;
    return (
      <Row align="middle" gutter={rowGutter}>
        <Col span={spans[0]}>
          <label className="setting-label">{label}</label>
        </Col>
        <Col span={spans[1]}>
          <Slider
            min={LOG_SLIDER_MIN}
            max={LOG_SLIDER_MAX}
            // @ts-expect-error ts-migrate(2322) FIXME: Type '(value: number) => string | number' is not a... Remove this comment to see the full error message
            tipFormatter={this.formatTooltip}
            onChange={this.onChangeSlider}
            value={this.getSliderValue()}
            disabled={disabled}
          />
        </Col>
        <Col span={spans[2]}>
          <InputNumber
            min={min}
            max={max}
            style={{
              width: "100%",
            }}
            value={roundTo != null ? Utils.roundTo(value, roundTo) : value}
            onChange={this.onChangeInput}
            disabled={disabled}
            size="small"
          />
        </Col>
      </Row>
    );
  }
}
type SwitchSettingProps = {
  onChange: (value: boolean) => void | Promise<void>;
  value: boolean;
  label: string | React.ReactNode;
  disabled: boolean;
  tooltipText: string | null | undefined;
  loading: boolean;
};
export class SwitchSetting extends React.PureComponent<SwitchSettingProps> {
  static defaultProps = {
    disabled: false,
    tooltipText: null,
    loading: false,
  };

  render() {
    const { label, onChange, value, disabled, tooltipText, loading } = this.props;
    return (
      <Row className="margin-bottom" align="middle" gutter={rowGutter}>
        <Col span={9}>
          <label className="setting-label">{label}</label>
        </Col>
        <Col span={15}>
          <Tooltip title={tooltipText} placement="top">
            {/* This div is necessary for the tooltip to be displayed */}
            <div
              style={{
                display: "inline-block",
              }}
            >
              <Switch
                onChange={onChange}
                checked={value}
                defaultChecked={value}
                disabled={disabled}
                loading={loading}
              />
            </div>
          </Tooltip>
        </Col>
      </Row>
    );
  }
}
type NumberInputSettingProps = {
  onChange: (value: number) => void;
  value: number | "";
  label: string;
  max?: number;
  min?: number;
  step?: number;
};
export class NumberInputSetting extends React.PureComponent<NumberInputSettingProps> {
  static defaultProps = {
    max: undefined,
    min: 1,
    step: 1,
  };

  render() {
    const { onChange, value, label, max, min, step } = this.props;
    return (
      <Row className="margin-bottom" align="top" gutter={rowGutter}>
        <Col span={9}>
          <label className="setting-label">{label}</label>
        </Col>
        <Col span={15}>
          <InputNumber
            style={{
              width: "100%",
            }}
            min={min}
            max={max}
            onChange={onChange}
            // @ts-expect-error ts-migrate(2322) FIXME: Type 'number | ""' is not assignable to type 'numb... Remove this comment to see the full error message
            value={value}
            step={step}
            size="small"
          />
        </Col>
      </Row>
    );
  }
}
type NumberInputPopoverSettingProps = {
  onChange: (value: number) => void;
  value: number | null | undefined;
  label: string | React.ReactNode;
  detailedLabel: string | React.ReactNode;
  placement?: string;
  max?: number;
  min?: number;
  step?: number;
};
export function NumberInputPopoverSetting(props: NumberInputPopoverSettingProps) {
  const { min, max, onChange, step, value, label, detailedLabel } = props;
  const placement = props.placement || "top";
  const numberInput = (
    <div>
      <div
        style={{
          marginBottom: 8,
        }}
      >
        {detailedLabel}:
      </div>
      <InputNumber
        style={{
          width: 140,
        }}
        min={min}
        max={max}
        onChange={onChange}
        // @ts-expect-error ts-migrate(2322) FIXME: Type 'number | null | undefined' is not assignable... Remove this comment to see the full error message
        value={value}
        step={step}
        size="small"
      />
    </div>
  );
  return (
    // @ts-expect-error ts-migrate(2322) FIXME: Type 'string' is not assignable to type 'TooltipPl... Remove this comment to see the full error message
    <Popover content={numberInput} trigger="click" placement={placement}>
      <span
        style={{
          cursor: "pointer",
        }}
      >
        {label} {value != null ? value : "-"}
        <EditOutlined
          style={{
            fontSize: 11,
            opacity: 0.7,
            margin: "0 0px 5px 3px",
          }}
        />
      </span>
    </Popover>
  );
}
type UserBoundingBoxInputProps = {
  value: Vector6;
  name: string;
  color: Vector3;
  isVisible: boolean;
  isExportEnabled: boolean;
  tooltipTitle: string;
  onBoundingChange: (arg0: Vector6) => void;
  onDelete: () => void;
  onExport: () => void;
  onGoToBoundingBox: () => void;
  onVisibilityChange: (arg0: boolean) => void;
  onNameChange: (arg0: string) => void;
  onColorChange: (arg0: Vector3) => void;
  allowUpdate: boolean;
};
type State = {
  isEditing: boolean;
  isValid: boolean;
  text: string;
  name: string;
};
export class UserBoundingBoxInput extends React.PureComponent<UserBoundingBoxInputProps, State> {
  constructor(props: UserBoundingBoxInputProps) {
    super(props);
    this.state = {
      isEditing: false,
      isValid: true,
      text: this.computeText(props.value),
      name: props.name,
    };
  }

  componentDidUpdate(prevProps: UserBoundingBoxInputProps) {
    if (!this.state.isEditing && prevProps.value !== this.props.value) {
      this.setState({
        isValid: true,
        text: this.computeText(this.props.value),
      });
    }

    if (prevProps.name !== this.props.name) {
      this.setState({
        name: this.props.name,
      });
    }
  }

  computeText(vector: Vector6) {
    return vector.join(", ");
  }

  handleBlur = () => {
    this.setState({
      isEditing: false,
      isValid: true,
      text: this.computeText(this.props.value),
    });
  };

  handleFocus = () => {
    this.setState({
      isEditing: true,
      text: this.computeText(this.props.value),
      isValid: true,
    });
  };

  handleChange = (evt: React.SyntheticEvent) => {
    // @ts-expect-error ts-migrate(2339) FIXME: Property 'value' does not exist on type 'EventTarg... Remove this comment to see the full error message
    const text = evt.target.value;
    // only numbers, commas and whitespace is allowed
    const isValidInput = /^[\d\s,]*$/g.test(text);
    const value = Utils.stringToNumberArray(text);
    const isValidLength = value.length === 6;
    const isValid = isValidInput && isValidLength;

    if (isValid) {
      this.props.onBoundingChange(Utils.numberArrayToVector6(value));
    }

    this.setState({
      text,
      isValid,
    });
  };

  handleColorChange = (color: Vector3) => {
    color = color.map((colorPart) => colorPart / 255) as any as Vector3;
    this.props.onColorChange(color);
  };

  handleNameChanged = (evt: React.SyntheticEvent) => {
    // @ts-expect-error ts-migrate(2339) FIXME: Property 'value' does not exist on type 'EventTarg... Remove this comment to see the full error message
    const currentEnteredName = evt.target.value;

    if (currentEnteredName !== this.props.name) {
      this.props.onNameChange(currentEnteredName);
    }
  };

  render() {
    const { name } = this.state;
    const tooltipStyle = this.state.isValid
      ? null
      : {
          backgroundColor: "red",
        };
    const {
      tooltipTitle,
      color,
      isVisible,
      onDelete,
      onExport,
      isExportEnabled,
      onGoToBoundingBox,
      allowUpdate,
    } = this.props;
    const upscaledColor = color.map((colorPart) => colorPart * 255) as any as Vector3;
    const iconStyle = {
      marginRight: 0,
      marginLeft: 6,
    };
    const disabledIconStyle = { ...iconStyle, opacity: 0.5, cursor: "not-allowed" };
    const exportIconStyle = isExportEnabled ? iconStyle : disabledIconStyle;
    const exportButtonTooltip = isExportEnabled
      ? "Export data from this bounding box."
      : messages["data.bounding_box_export_not_supported"];
    const exportColumn = features().jobsEnabled ? (
      <Col span={2}>
        <Tooltip title={exportButtonTooltip} placement="topRight">
          <DownloadOutlined onClick={onExport} style={exportIconStyle} />
        </Tooltip>
      </Col>
    ) : null;
    return (
      <React.Fragment>
        <Row
          style={{
            marginBottom: 10,
          }}
        >
          <Col span={5}>
            <Switch
              size="small"
              onChange={this.props.onVisibilityChange}
              checked={isVisible}
              style={{
                margin: "auto 0px",
              }}
            />
          </Col>

          <Col span={15}>
            <Tooltip title={allowUpdate ? null : messages["tracing.read_only_mode_notification"]}>
              <span>
                <Input
                  defaultValue={name}
                  placeholder="Bounding Box Name"
                  size="small"
                  value={name}
                  onChange={(evt: React.SyntheticEvent) => {
                    this.setState({ name: (evt.target as HTMLInputElement).value });
                  }}
                  onPressEnter={this.handleNameChanged}
                  onBlur={this.handleNameChanged}
                  disabled={!allowUpdate}
                />
              </span>
            </Tooltip>
          </Col>
          {exportColumn}
          <Col span={2}>
            <Tooltip
              title={
                allowUpdate
                  ? "Delete this bounding box."
                  : messages["tracing.read_only_mode_notification"]
              }
            >
              <DeleteOutlined
                onClick={onDelete}
                style={allowUpdate ? iconStyle : disabledIconStyle}
                disabled={!allowUpdate}
              />
            </Tooltip>
          </Col>
        </Row>
        <Row
          style={{
            marginBottom: 20,
          }}
          align="top"
        >
          <Col span={5}>
            <Tooltip title="The top-left corner of the bounding box followed by the width, height, and depth.">
              <label className="settings-label"> Bounds: </label>
            </Tooltip>
          </Col>
          <Col span={15}>
            <Tooltip
              trigger={allowUpdate ? ["focus"] : ["hover"]}
              title={allowUpdate ? tooltipTitle : messages["tracing.read_only_mode_notification"]}
              placement="topLeft"
              // @ts-expect-error ts-migrate(2322) FIXME: Type '{ backgroundColor: string; } | null' is not ... Remove this comment to see the full error message
              overlayStyle={tooltipStyle}
            >
              <span>
                <Input
                  onChange={this.handleChange}
                  onFocus={this.handleFocus}
                  onBlur={this.handleBlur}
                  value={this.state.text}
                  placeholder="0, 0, 0, 512, 512, 512"
                  size="small"
                  disabled={!allowUpdate}
                />
              </span>
            </Tooltip>
          </Col>
          <Col span={2}>
            <Tooltip title={allowUpdate ? null : messages["tracing.read_only_mode_notification"]}>
              <span>
                <ColorSetting
                  value={Utils.rgbToHex(upscaledColor)}
                  onChange={this.handleColorChange}
                  style={iconStyle}
                  disabled={!allowUpdate}
                />
              </span>
            </Tooltip>
          </Col>
          <Col span={2}>
            <Tooltip title="Go to the center of the bounding box.">
              <ScanOutlined onClick={onGoToBoundingBox} style={{ ...iconStyle, marginTop: 6 }} />
            </Tooltip>
          </Col>
        </Row>
      </React.Fragment>
    );
  }
}
type ColorSettingPropTypes = {
  value: string;
  onChange: (value: Vector3) => void;
  disabled: boolean;
  style?: Record<string, any>;
};
export class ColorSetting extends React.PureComponent<ColorSettingPropTypes> {
  static defaultProps = {
    disabled: false,
  };

  onColorChange = (evt: React.SyntheticEvent) => {
    // @ts-expect-error ts-migrate(2339) FIXME: Property 'value' does not exist on type 'EventTarg... Remove this comment to see the full error message
    this.props.onChange(Utils.hexToRgb(evt.target.value));
  };

  render() {
    const { value, disabled } = this.props;
    let { style } = this.props;
    style = style || {};
    return (
      <div
        className="color-display-wrapper"
        style={{
          backgroundColor: value,
          ...style,
        }}
      >
        <input
          type="color"
          style={{
            opacity: 0,
            display: "block",
            border: "none",
            cursor: disabled ? "not-allowed" : "pointer",
            width: "100%",
            height: "100%",
          }}
          onChange={this.onColorChange}
          value={value}
          disabled={disabled}
        />
      </div>
    );
  }
}
type DropdownSettingProps = {
  onChange: (value: number) => void;
  label: React.ReactNode | string;
  value: number | string;
  options: Array<Record<string, any>>;
};
export class DropdownSetting extends React.PureComponent<DropdownSettingProps> {
  render() {
    const { onChange, label, value } = this.props;
    return (
      <Row className="margin-bottom" align="top">
        <Col span={9}>
          <label className="setting-label">{label}</label>
        </Col>
        <Col span={15}>
          <Select
            onChange={onChange}
            // @ts-expect-error ts-migrate(2322) FIXME: Type 'string' is not assignable to type 'number | ... Remove this comment to see the full error message
            value={value.toString()}
            // @ts-expect-error ts-migrate(2322) FIXME: Type 'string' is not assignable to type 'number | ... Remove this comment to see the full error message
            defaultValue={value.toString()}
            size="small"
            dropdownMatchSelectWidth={false}
            // @ts-expect-error ts-migrate(2322) FIXME: Type 'Record<string, any>[]' is not assignable to ... Remove this comment to see the full error message
            options={this.props.options}
          />
        </Col>
      </Row>
    );
  }
}