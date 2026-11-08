using UnityEngine;

/// 검지 끝 시각 dot(LM8)과 완전히 동일한 위치를 따라가는 키네마틱 충돌구체.
/// 시각 dot이 블록에 닿아야 블록이 반응하도록, HandVisualizer.GetLandmarkWorldPosition(8) 기반.
/// 카메라 회전 등으로 dot이 크게 점프할 때는 MovePosition 대신 순간이동 → 블록에 충격 없음.
[RequireComponent(typeof(SphereCollider))]
public class HandPhysicsCollider : MonoBehaviour
{
    [SerializeField] private HandVisualizer handVisualizer;

    [Tooltip("충돌 구체 반지름. 시각 dot 크기(0.012)보다 조금 크게 설정.")]
    [SerializeField] private float colliderRadius = 0.018f;

    [Tooltip("이 거리 이상 순간이동(카메라 회전 보호). 너무 작으면 MovePosition이 안 됨.")]
    [SerializeField] private float teleportThreshold = 0.25f;

    /// 현재 프레임에 블록에 가해지는 충격력 (N). HapticController가 servo2에 사용.
    public float ContactForce { get; private set; }

    private Rigidbody _rb;
    private SphereCollider _col;
    private bool _wasTracking;
    private bool _hadContact;
    private Vector3 _prevTarget;

    private static readonly Vector3 ParkPosition = new Vector3(0f, -100f, 0f);

    private void Start()
    {
        if (handVisualizer == null)
            handVisualizer = FindObjectOfType<HandVisualizer>();

        _col = GetComponent<SphereCollider>();
        _col.radius = colliderRadius;
        _col.enabled = false;

        // Rigidbody를 코드로 추가 (에디터에서 실수로 설정 변경되는 것 방지)
        if (!TryGetComponent<Rigidbody>(out _rb))
            _rb = gameObject.AddComponent<Rigidbody>();

        _rb.isKinematic = true;
        _rb.useGravity = false;
        _rb.interpolation = RigidbodyInterpolation.Interpolate;
        _rb.collisionDetectionMode = CollisionDetectionMode.ContinuousDynamic;

        _rb.position = ParkPosition;
        transform.position = ParkPosition;
        _prevTarget = ParkPosition;
    }

    private void OnCollisionStay(Collision col)
    {
        // impulse / fixedDeltaTime → 평균 충격력(N). 여러 contact point면 합산됨.
        ContactForce = col.impulse.magnitude / Time.fixedDeltaTime;
        _hadContact = true;
    }

    private void FixedUpdate()
    {
        // OnCollisionStay가 없었던 프레임 → 접촉 없음
        if (!_hadContact) ContactForce = 0f;
        _hadContact = false;

        if (handVisualizer == null || !handVisualizer.IsHandVisible)
        {
            if (_wasTracking)
            {
                _col.enabled = false;
                _rb.position = ParkPosition;
                transform.position = ParkPosition;
                _prevTarget = ParkPosition;
            }
            _wasTracking = false;
            return;
        }

        // LM8 = 검지 끝 dot의 현재 월드 위치 (화면 기준, 카메라 시점)
        Vector3 target = handVisualizer.GetLandmarkWorldPosition(8);

        if (target.y < -50f) return; // 유효하지 않은 위치 무시

        if (!_wasTracking)
        {
            // 첫 감지 프레임: 순간이동 후 콜라이더 활성화 (충격량 0)
            _rb.position = target;
            transform.position = target;
            _col.enabled = true;
            _wasTracking = true;
            _prevTarget = target;
            return;
        }

        float dist = Vector3.Distance(target, _prevTarget);
        if (dist > teleportThreshold)
        {
            // 카메라 회전 등으로 큰 점프 발생 → 순간이동 (MovePosition은 속도 생성)
            _rb.position = target;
            transform.position = target;
        }
        else
        {
            _rb.MovePosition(target);
        }

        _prevTarget = target;
    }
}
