import React, {
  useRef,
  useCallback,
  ChangeEvent,
  useState,
  useMemo,
} from "react";
import { useEffect } from "react";
import styled, { createGlobalStyle } from "styled-components";
import { useImmer } from "use-immer";
import Peer, { MediaConnection } from "skyway-js";
import qs from "querystring";
import copy from "copy-text-to-clipboard";

enum StorageKey {
  videoDeviceId = "videoDeviceId",
  audioDeviceId = "audioDeviceId",
  theirId = "theirId",
}

interface State {
  peerId: string;
  theirId: string;
  audioDeviceId: string | null;
  videoDeviceId: string | null;
  status: "pause" | "sending" | "clientConnected";
}

const useAsyncEffect = (callback: any, deps: any[]) => {
  useEffect(() => {
    callback();
  }, deps);
};

export const App = () => {
  const query = useMemo(() => qs.parse(location.search.slice(1)), []);

  const [state, setState] = useImmer<State>({
    peerId: (query.peer_id as string) ?? null,
    theirId:
      (query.host_id as string) ??
      localStorage.getItem(StorageKey.theirId) ??
      "",
    audioDeviceId: localStorage.getItem(StorageKey.audioDeviceId) ?? null,
    videoDeviceId: localStorage.getItem(StorageKey.videoDeviceId) ?? null,
    status: "pause",
  });

  const [videoDevices, setVideoDevices] = useState<MediaDeviceInfo[]>([]);
  const [audioDevices, setAudioDevices] = useState<MediaDeviceInfo[]>([]);

  const peerRef = useRef<Peer | null>(null);
  const mediaConenction = useRef<MediaConnection | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useAsyncEffect(async () => {
    const devices = await navigator.mediaDevices.enumerateDevices();
    setVideoDevices(devices.filter((dev) => dev.kind === "videoinput"));
    setAudioDevices(devices.filter((dev) => dev.kind === "audioinput"));
  }, []);

  // Peerのセットアップ
  useAsyncEffect(async () => {
    peerRef.current = new Peer(state.peerId, {
      key: process.env.API_KEY,
      debug: 3,
    });

    peerRef.current.on("open", () => {
      setState((state) => {
        state.peerId = peerRef.current.id;
      });
    });

    peerRef.current.on("call", (mediaConnection) => {
      mediaConnection.answer();

      mediaConnection.on("stream", (stream) => {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
        setState((state) => {
          state.status = "clientConnected";
        });
      });
    });
  }, []);

  const handleChangeTheirId = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const { value } = e.currentTarget;

      setState((state) => {
        state.theirId = value;
      });
    },
    []
  );

  const handleConnect = useCallback(async () => {
    localStorage.setItem(StorageKey.theirId, state.theirId);

    streamRef.current = await navigator.mediaDevices.getUserMedia({
      video: { deviceId: state.videoDeviceId, width: 1280, height: 720 },
      audio: {
        deviceId: state.audioDeviceId,
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
        sampleSize: 16,
        sampleRate: 48000,
        channelCount: 2,
      },
    });

    mediaConenction.current = peerRef.current.call(
      state.theirId,
      streamRef.current,
      {
        audioBandwidth: 320,
        audioCodec: "opus",
      }
    );

    videoRef.current.srcObject = streamRef.current;
    videoRef.current.muted = true;
    videoRef.current.play();

    setState((state) => {
      state.status = "sending";
    });
  }, [state, setState]);

  const handleChangeVideoDevice = useCallback(
    (e: ChangeEvent<HTMLSelectElement>) => {
      const deviceId = e.currentTarget.value;

      setState((state) => {
        state.videoDeviceId = deviceId;
      });

      localStorage.setItem(StorageKey.videoDeviceId, e.currentTarget.value);
    },
    []
  );

  const handleChangeAudioDevice = useCallback(
    (e: ChangeEvent<HTMLSelectElement>) => {
      const deviceId = e.currentTarget.value;

      setState((state) => {
        state.audioDeviceId = deviceId;
      });

      localStorage.setItem(StorageKey.audioDeviceId, e.currentTarget.value);
    },
    []
  );

  const handleClickShareLink = useCallback(() => {
    const port = location.port !== "" ? `:${location.port}` : "";
    const url = `${location.protocol}//${location.hostname}${port}${location.pathname}`;
    copy(`${url}?host_id=${state.peerId}`);
  }, [state]);

  return (
    <Root>
      <GlobalStyle />

      {state.status !== "clientConnected" && (
        <MetaArea disabled={state.status === "sending"}>
          <div>
            <div>
              PeerId: <input value={state.peerId} readOnly />
              <Button
                type="button"
                onClick={handleClickShareLink}
                style={{ marginLeft: "4px" }}
              >
                ゲスト招待URLをコピー
              </Button>
            </div>
            <div>
              接続先Id:{" "}
              <input
                type="text"
                value={state.theirId}
                onChange={handleChangeTheirId}
              />
              <Button
                type="button"
                onClick={handleConnect}
                style={{ marginLeft: "4px" }}
              >
                接続
              </Button>
            </div>
          </div>
          <div style={{ marginLeft: "auto" }}>
            <div>
              ビデオ入力:
              <select onChange={handleChangeVideoDevice}>
                {videoDevices.map((dev) => (
                  <option
                    selected={dev.deviceId === state.videoDeviceId}
                    value={dev.deviceId}
                  >
                    {dev.label ?? dev.deviceId}
                  </option>
                ))}
              </select>
            </div>
            <div>
              オーディオ入力:
              <select onChange={handleChangeAudioDevice}>
                {audioDevices.map((dev) => (
                  <option
                    selected={dev.deviceId === state.audioDeviceId}
                    value={dev.deviceId}
                  >
                    {dev.label ?? dev.deviceId}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </MetaArea>
      )}
      <PreviewArea fullview={state.status === "clientConnected"}>
        {state.status === "sending" && (
          <SendingOverlay>接続されています</SendingOverlay>
        )}
        <PreviewVideo ref={videoRef} />
      </PreviewArea>
    </Root>
  );
};

const GlobalStyle = createGlobalStyle`
  html, body {
    width: 100%;
    height: 100%;
    margin: 0;
    padding: 0;
  }


  *, *::before, *::after {
    box-sizing: border-box;
  }

  #root {
    display: flex;
    width: 100%;
    height: 100%;
  }
`;

const Root = styled.div`
  display: flex;
  flex-flow: column;
  width: 100%;
  height: 100%;
  background-color: #111;
  color: #fff;
`;

const Button = styled.button`
  background-color: #fff;
  line-height: 1.4;
  display: inline-block;
  border: none;
  border-radius: 6px;
  padding: 2px 8px;
  outline: none;
  appearance: none;

  &:active {
    background-color: #ddd;
  }
`;

const MetaArea = styled.div<{ disabled: boolean }>`
  display: flex;
  gap: 16px;
  width: 100%;
  padding: 4px;

  ${({ disabled }) => disabled && `opacity: .5;`}
`;

const PreviewArea = styled.div<{ fullview: boolean }>`
  position: relative;
  display: flex;
  justify-content: center;
  align-items: center;
  width: 100%;
  height: 100%;

  ${({ fullview }) => !fullview && `padding: 16px;`}
`;

const SendingOverlay = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  z-index: 1;
  display: flex;
  justify-content: center;
  align-items: center;
  width: 100%;
  height: 100%;
  background-color: rgba(0, 0, 0, 0.5);
  color: #fff;
`;

const PreviewVideo = styled.video`
  object-fit: contain;
  width: 100%;
`;
