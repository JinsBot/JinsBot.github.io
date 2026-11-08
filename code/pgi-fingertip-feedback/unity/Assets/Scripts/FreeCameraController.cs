using UnityEngine;

/// 젠가 탑 중심(pivot)을 기준으로 카메라를 궤도 회전.
/// A/D · 좌우키: 좌우 수평 회전 (무제한)
/// W/S · 상하키: 상하 수직 회전 (±89° 제한)
/// 마우스 우클릭 드래그: 동일한 궤도 회전
public class FreeCameraController : MonoBehaviour
{
    [Header("궤도 중심")]
    [Tooltip("젠가 탑 중앙 월드 좌표로 설정")]
    [SerializeField] private Vector3 pivot = Vector3.zero;

    [Header("회전 속도")]
    [Tooltip("키보드 회전 속도 (도/초)")]
    [SerializeField] private float orbitSpeed = 60f;

    [Tooltip("마우스 우클릭 드래그 감도")]
    [SerializeField] private float mouseSensitivity = 2f;

    private float _yaw;
    private float _pitch;
    private float _distance;

    private void Start()
    {
        Vector3 offset = transform.position - pivot;
        _distance = Mathf.Max(offset.magnitude, 0.1f);

        float horizDist = new Vector2(offset.x, offset.z).magnitude;
        _pitch = Mathf.Atan2(offset.y, horizDist) * Mathf.Rad2Deg;
        _yaw   = Mathf.Atan2(offset.x, offset.z)  * Mathf.Rad2Deg;
    }

    private void Update()
    {
        float h = Input.GetAxisRaw("Horizontal");
        float v = Input.GetAxisRaw("Vertical");

        _yaw   -= h * orbitSpeed * Time.deltaTime;
        _pitch += v * orbitSpeed * Time.deltaTime;
        _pitch  = Mathf.Clamp(_pitch, -89f, 89f);

        if (Input.GetMouseButton(1))
        {
            _yaw   += Input.GetAxis("Mouse X") * mouseSensitivity;
            _pitch += Input.GetAxis("Mouse Y") * mouseSensitivity;
            _pitch  = Mathf.Clamp(_pitch, -89f, 89f);
        }

        Quaternion rot = Quaternion.Euler(_pitch, _yaw, 0f);
        transform.position = pivot + rot * Vector3.back * _distance;
        transform.LookAt(pivot);
    }
}
