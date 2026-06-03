// Copyright 2021 The Casdoor Authors. All Rights Reserved.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import {Button, Input, Space} from "antd";
import React from "react";
import i18next from "i18next";
import * as UserBackend from "../backend/UserBackend";
import * as AuthBackend from "../auth/AuthBackend";
import * as Setting from "../Setting";
import {SafetyOutlined} from "@ant-design/icons";
import {CaptchaModal} from "./modal/CaptchaModal";

function normalizeOtp(raw, expectedLen = 6) {
  const digits = String(raw ?? "").replace(/\D/g, "");
  if (!digits) {
    return "";
  }

  if (digits.length === expectedLen * 2) {
    const half = digits.slice(0, expectedLen);
    if (`${half}${half}` === digits) {
      return half;
    }
  }

  return digits.slice(0, expectedLen);
}

export const SendCodeInput = ({value, disabled, captchaValue, useInlineCaptcha, textBefore, onChange, onButtonClickArgs, application, method, countryCode, refreshCaptcha}) => {
  const [visible, setVisible] = React.useState(false);
  const [buttonLeftTime, setButtonLeftTime] = React.useState(0);
  const [buttonLoading, setButtonLoading] = React.useState(false);
  const inputRef = React.useRef(null);
  const syncTimerRef = React.useRef(null);
  const expectedCodeLength = 6;

  const handleCodeChange = React.useCallback((raw) => {
    const normalizedCode = normalizeOtp(raw, expectedCodeLength);
    if (normalizedCode !== value) {
      onChange(normalizedCode);
    }
  }, [onChange, expectedCodeLength, value]);

  const scheduleSyncFromDom = React.useCallback(() => {
    if (syncTimerRef.current) {
      clearTimeout(syncTimerRef.current);
    }

    // iOS/WebView autofill can update the native input before React's controlled value updates.
    syncTimerRef.current = setTimeout(() => {
      const rawValue = inputRef.current?.input?.value ?? "";
      handleCodeChange(rawValue);
    }, 30);
  }, [handleCodeChange]);

  React.useEffect(() => {
    return () => {
      if (syncTimerRef.current) {
        clearTimeout(syncTimerRef.current);
      }
    };
  }, []);

  const getCodeResendTimeout = () => {
    // Use application's codeResendTimeout if available, otherwise default to 60 seconds
    return (application && application.codeResendTimeout > 0) ? application.codeResendTimeout : 60;
  };

  const handleCountDown = (leftTime = getCodeResendTimeout()) => {
    let leftTimeSecond = leftTime;
    setButtonLeftTime(leftTimeSecond);
    const countDown = () => {
      leftTimeSecond--;
      setButtonLeftTime(leftTimeSecond);
      if (leftTimeSecond === 0) {
        return;
      }
      setTimeout(countDown, 1000);
    };
    setTimeout(countDown, 1000);
  };

  const handleOk = (captchaType, captchaToken, clintSecret) => {
    setVisible(false);
    setButtonLoading(true);
    UserBackend.sendCode(captchaType, captchaToken, clintSecret, method, countryCode, ...onButtonClickArgs).then(res => {
      setButtonLoading(false);
      if (res) {
        handleCountDown(getCodeResendTimeout());
      } else {
        if (useInlineCaptcha) {
          refreshCaptcha?.();
        }
      }
    }).catch(() => {
      setButtonLoading(false);
      if (useInlineCaptcha) {
        refreshCaptcha?.();
      }
    });
  };

  const handleCancel = () => {
    setVisible(false);
  };

  const handleSearch = () => {
    const sendCodeWithoutCaptcha = () => {
      handleOk("none", "", "");
    };

    const sendCodeWithCaptcha = () => {
      if (!useInlineCaptcha) {
        setVisible(true);
        return;
      }

      // client secret is validated in backend
      if (!captchaValue?.captchaType || !captchaValue?.captchaToken) {
        Setting.showMessage("error", i18next.t("general:Please complete the captcha correctly"));
        return;
      }

      handleOk(captchaValue.captchaType, captchaValue.captchaToken, captchaValue.clientSecret);
    };

    const checkCaptchaStatusAndSend = () => {
      const values = {
        organization: application?.organization,
        username: onButtonClickArgs?.[3] || onButtonClickArgs?.[0],
        application: application?.name,
      };

      AuthBackend.getCaptchaStatus(values)
        .then((res) => {
          if (res.status === "ok" && res.data) {
            sendCodeWithCaptcha();
            return;
          }

          sendCodeWithoutCaptcha();
        })
        .catch(() => {
          sendCodeWithoutCaptcha();
        });
    };

    const captchaRule = Setting.getCaptchaRule(application);
    if (captchaRule === Setting.CaptchaRule.Never) {
      sendCodeWithoutCaptcha();
      return;
    }

    if (captchaRule === Setting.CaptchaRule.Always) {
      sendCodeWithCaptcha();
      return;
    }

    if (captchaRule === Setting.CaptchaRule.Dynamic || captchaRule === Setting.CaptchaRule.InternetOnly) {
      checkCaptchaStatusAndSend();
      return;
    }

    sendCodeWithoutCaptcha();
  };

  return (
    <React.Fragment>
      <Space.Compact style={{width: "100%"}}>
        <Input
          ref={inputRef}
          addonBefore={textBefore}
          disabled={disabled}
          value={value}
          prefix={<SafetyOutlined />}
          placeholder={i18next.t("code:Enter your code")}
          className="verification-code-input"
          maxLength={expectedCodeLength}
          inputMode="numeric"
          onChange={e => handleCodeChange(e.target.value)}
          onInput={scheduleSyncFromDom}
          onFocus={scheduleSyncFromDom}
          autoComplete="one-time-code"
        />
        <Button style={{fontSize: 14}} type={"primary"} disabled={disabled || buttonLeftTime > 0} loading={buttonLoading} onClick={handleSearch}>
          {buttonLeftTime > 0 ? `${buttonLeftTime} s` : buttonLoading ? i18next.t("code:Getting") : i18next.t("code:Get Code")}
        </Button>
      </Space.Compact>
      {
        useInlineCaptcha ? null : (
          <CaptchaModal
            owner={application.owner}
            name={application.name}
            visible={visible}
            onOk={handleOk}
            onCancel={handleCancel}
            isCurrentProvider={false}
          />
        )
      }
    </React.Fragment>
  );
};
