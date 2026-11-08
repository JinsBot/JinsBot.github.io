using System;
using System.Net;
using System.Net.Sockets;
using System.Text;
using System.Threading;
using UnityEngine;

/// Receives MediaPipe hand landmark data over UDP and exposes the
/// right-hand index fingertip (landmark 8) as a Unity Vector3.
///
/// Architecture:
///   - Background thread: blocking Receive() → stores raw JSON in _latestJson
///   - Main thread (Update): reads _latestJson under lock, then parses
///
/// Expected JSON format from Python (21 landmarks):
///   {"landmarks": [{"x":0.5,"y":0.3,"z":0.0}, ... 21 entries ...]}
///   x, y: normalized image coords [0,1];  z: depth relative to wrist
///   Landmark 8 = right-hand index fingertip → IndexTipPosition
public class HandTracker : MonoBehaviour
{
    [SerializeField] private int udpPort = 5005;

    [Header("Position Mapping")]
    [Tooltip("X/Y 스케일. 손의 좌우·상하 움직임 범위 조정.")]
    [SerializeField] private float positionScale = 3f;

    [Tooltip("Z(깊이) 전용 스케일. 값이 클수록 손이 앞뒤로 더 민감하게 움직임. 블록 밀기 범위 조정에 사용.")]
    [SerializeField] private float zScale = 5f;

    [Tooltip("월드 오프셋. X=좌우 Y=높이 Z=블록 기준 앞뒤. Z=-0.5 근처에서 시작해 블록과 맞도록 조정.")]
    [SerializeField] private Vector3 originOffset = new Vector3(0f, 0f, -0.5f);

    public Vector3 IndexTipPosition { get; private set; }
    public Vector3[] Landmarks { get; private set; }    // 월드 좌표 (햅틱용)
    public Vector3[] RawLandmarks { get; private set; } // MediaPipe 정규화 좌표 x∈[0,1] y∈[0,1] z=depth (시각화용)
    public bool IsTracking { get; private set; }
    /// confidence(0~1) × decay(0~1). 손이 불안정하거나 hold-and-decay 중이면 낮아짐.
    public float TrackingQuality { get; private set; }

    private UdpClient _udpClient;
    private Thread _receiveThread;
    private string _latestJson;
    private readonly object _lock = new object();
    private bool _running;

    private void Start()
    {
        try
        {
            _udpClient = new UdpClient(udpPort);
            // 1-second receive timeout: lets the loop check _running periodically
            // and exit cleanly when OnDestroy closes the socket
            _udpClient.Client.ReceiveTimeout = 1000;
        }
        catch (SocketException e)
        {
            Debug.LogError($"[HandTracker] Cannot bind port {udpPort}: {e.Message}");
            return;
        }

        _running = true;
        _receiveThread = new Thread(ReceiveLoop)
        {
            IsBackground = true,
            Name = "HandTracker-UDP"
        };
        _receiveThread.Start();
        Debug.Log($"[HandTracker] Listening on UDP 0.0.0.0:{udpPort}");
    }

    private void Update()
    {
        string json;
        lock (_lock)
        {
            json = _latestJson;
            _latestJson = null;
        }
        if (json != null)
            ParseLandmarks(json);
    }

    // ── Background receive thread ────────────────────────────────────

    private void ReceiveLoop()
    {
        IPEndPoint ep = new IPEndPoint(IPAddress.Any, 0);
        Debug.Log("[HandTracker] ReceiveLoop started");

        while (_running)
        {
            try
            {
                byte[] data = _udpClient.Receive(ref ep);
                string json = Encoding.UTF8.GetString(data);
                lock (_lock)
                    _latestJson = json;
            }
            catch (SocketException e) when (e.SocketErrorCode == SocketError.TimedOut)
            {
                // Normal 1-second timeout — loop back and check _running
            }
            catch (SocketException e) when (!_running)
            {
                // Socket closed by OnDestroy — expected, exit quietly
                Debug.Log("[HandTracker] Socket closed, ReceiveLoop exiting");
            }
            catch (ThreadAbortException)
            {
                // Unity aborts background threads when play mode stops — exit quietly
                return;
            }
            catch (Exception e)
            {
                if (_running)
                    Debug.LogError($"[HandTracker] Receive error: {e.GetType().Name}: {e.Message}");
                Thread.Sleep(100); // Prevent tight error spin-loop
            }
        }

        Debug.Log("[HandTracker] ReceiveLoop ended");
    }

    // ── Parsing (main thread) ────────────────────────────────────────

    private void ParseLandmarks(string json)
    {
        LandmarkPacket packet;
        try
        {
            packet = JsonUtility.FromJson<LandmarkPacket>(json);
        }
        catch (Exception e)
        {
            Debug.LogWarning($"[HandTracker] JSON parse error: {e.Message}  json={json}");
            IsTracking = false;
            return;
        }

        if (packet?.landmarks == null || packet.landmarks.Length < 21)
        {
            Debug.LogWarning($"[HandTracker] Expected 21 landmarks, got {packet?.landmarks?.Length ?? 0}");
            IsTracking      = false;
            TrackingQuality = 0f;
            return;
        }

        // MediaPipe: x/y are image-space [0,1], Y is image-down
        // → remap to centred coords, flip Y for Unity's Y-up world
        if (Landmarks == null || Landmarks.Length != 21)
            Landmarks = new Vector3[21];
        if (RawLandmarks == null || RawLandmarks.Length != 21)
            RawLandmarks = new Vector3[21];

        for (int i = 0; i < 21; i++)
        {
            var lm = packet.landmarks[i];
            RawLandmarks[i] = new Vector3(lm.x, lm.y, lm.z);
            Landmarks[i] = new Vector3(
                (lm.x - 0.5f) * positionScale + originOffset.x,
                (0.5f - lm.y) * positionScale + originOffset.y,
                -lm.z          * zScale        + originOffset.z
            );
        }

        IndexTipPosition = Landmarks[8];
        IsTracking       = packet.decay > 0f;
        TrackingQuality  = packet.confidence * packet.decay;
    }

    private void OnDestroy()
    {
        _running = false;
        _udpClient?.Close();
    }

    // ── Serialisable data classes ────────────────────────────────────

    [Serializable]
    private class LM { public float x, y, z; }

    [Serializable]
    private class LandmarkPacket
    {
        public LM[]  landmarks;
        public float confidence = 1f; // Python: handedness × key-LM visibility
        public float decay      = 1f; // Python: 1.0=정상, 0→1/DECAY_FRAMES=hold중
    }
}
