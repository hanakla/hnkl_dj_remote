import React, { useRef, useCallback, ChangeEvent, useState } from "react";
import { useEffect } from "react";
import styled, { createGlobalStyle } from "styled-components";
import { useImmer } from "use-immer";
import Peer, { MediaConnection } from "skyway-js";

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
  status: "pause" | "sending" | "connected";
}

const useAsyncEffect = (callback: any, deps: any[]) => {
  useEffect(() => {
    callback();
  }, deps);
};

export const App = () => {
  const [state, setState] = useImmer<State>({
    peerId: "",
    theirId: localStorage.getItem(StorageKey.theirId) ?? null,
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
    try {
      await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    } catch (e) {
      alert("カメラとマイクの利用を許可してください");
    }
  }, []);

  useAsyncEffect(async () => {
    const devices = await navigator.mediaDevices.enumerateDevices();
    setVideoDevices(devices.filter((dev) => dev.kind === "videoinput"));
    setAudioDevices(devices.filter((dev) => dev.kind === "audioinput"));
  }, []);

  // Peerのセットアップ
  useAsyncEffect(async () => {
    peerRef.current = new Peer({
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
          state.status = "connected";
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
      audio: { deviceId: state.audioDeviceId },
    });

    mediaConenction.current = peerRef.current.call(
      state.theirId,
      streamRef.current,
      {
        audioBandwidth: 320,
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

  return (
    <Root>
      <GlobalStyle />

      <MetaArea disabled={state.status === "connected"}>
        <div>
          <div>
            PeerId:
            <input value={state.peerId} readOnly />
          </div>
          <div>
            接続先Id:{" "}
            <input
              type="text"
              value={state.theirId}
              onChange={handleChangeTheirId}
            />
            <button type="button" onClick={handleConnect}>
              接続
            </button>
          </div>
        </div>
        <div style={{ marginLeft: "auto" }}>
          <div>
            Video:
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
            Audio:
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
      <PreviewArea>
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

const MetaArea = styled.div<{ disabled: boolean }>`
  display: flex;
  gap: 16px;
  width: 100%;
  padding: 4px;

  ${({ disabled }) => disabled && `opacity: .5;`}
`;

const PreviewArea = styled.div`
  position: relative;
  display: flex;
  justify-content: center;
  align-items: center;
  width: 100%;
  height: 100%;
  padding: 16px;
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
