using System.IO.Ports;
using UnityEngine;

public class SerialController : MonoBehaviour
{
    [SerializeField] private bool enableSerial = true;
    [SerializeField] private string portName = "COM13";
    [SerializeField] private int baudRate = 115200;
    [SerializeField] private float reconnectInterval = 3f;

    public byte Servo1Angle { get; set; } = 0;  // lever rotation  0–90
    public byte Servo2Angle { get; set; } = 0;  // pad pressure    0–180

    private SerialPort _port;
    private int _writeErrorCount;
    private bool _reconnecting;
    private float _reconnectTimer;

    private void Start()
    {
        if (enableSerial) TryOpen();
    }

    private void Update()
    {
        if (!enableSerial) return;

        if (_reconnecting)
        {
            _reconnectTimer -= Time.deltaTime;
            if (_reconnectTimer <= 0f)
                TryOpen();
            return;
        }
        Send(Servo1Angle, Servo2Angle);
    }

    private void TryOpen()
    {
        _reconnecting = false;
        try
        {
            if (_port != null && _port.IsOpen) _port.Close();
            _port = new SerialPort(portName, baudRate);
            _port.Open();
            _writeErrorCount = 0;
            Debug.Log($"[SerialController] Opened {portName} @ {baudRate} baud");
        }
        catch (System.Exception e)
        {
            Debug.LogWarning($"[SerialController] Cannot open {portName}: {e.Message} — retry in {reconnectInterval}s");
            ScheduleReconnect();
        }
    }

    public void Send(byte servo1, byte servo2)
    {
        if (_port == null || !_port.IsOpen) return;
        try
        {
            _port.Write(new byte[] { servo1, servo2 }, 0, 2);
            _writeErrorCount = 0;
        }
        catch (System.Exception e)
        {
            _writeErrorCount++;
            if (_writeErrorCount == 1)
                Debug.LogWarning($"[SerialController] Write error: {e.Message}");
            else if (_writeErrorCount >= 5)
            {
                Debug.LogWarning($"[SerialController] 5 write errors on {portName} — scheduling reconnect in {reconnectInterval}s");
                try { _port.Close(); } catch { }
                ScheduleReconnect();
            }
        }
    }

    private void ScheduleReconnect()
    {
        _reconnecting = true;
        _reconnectTimer = reconnectInterval;
    }

    private void OnDestroy()
    {
        if (_port != null && _port.IsOpen)
            _port.Close();
    }
}
