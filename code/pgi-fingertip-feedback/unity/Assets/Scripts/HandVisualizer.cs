using UnityEngine;

/// Renders 21 MediaPipe hand landmarks as small white spheres in the scene.
/// Call UpdateLandmarks() each frame from HapticController.
public class HandVisualizer : MonoBehaviour
{
    [SerializeField] private float sphereRadius = 0.012f;

    [Tooltip("기본 뷰포트 depth (m). 손이 가장 멀 때 카메라에서의 거리.")]
    [SerializeField] private float screenDepth = 1.5f;

    [Tooltip("손 크기에 따른 depth 증가량. 값이 클수록 손이 가까울 때 더 멀리 이동.")]
    [SerializeField] private float depthByHandSize = 4f;

    [Tooltip("손이 가까울수록 점들을 손바닥 중심으로 수축. 값이 클수록 수축 강도 ↑ (권장 3~6)")]
    [SerializeField] private float spreadShrink = 4f;

    private const int LandmarkCount = 21;
    private GameObject[] _spheres;

    private void Awake()
    {
        // URP Unlit: exposes _ZTest so we can force Always-on-top rendering
        var mat = new Material(Shader.Find("Universal Render Pipeline/Unlit") ?? Shader.Find("Unlit/Color"));
        mat.color = Color.white;
        // Render after all opaque/transparent geometry so spheres are never hidden
        mat.renderQueue = 5000;
        if (mat.HasProperty("_ZTest"))
            mat.SetFloat("_ZTest", (float)UnityEngine.Rendering.CompareFunction.Always);

        _spheres = new GameObject[LandmarkCount];
        for (int i = 0; i < LandmarkCount; i++)
        {
            var go = GameObject.CreatePrimitive(PrimitiveType.Sphere);
            go.name = $"LM_{i:D2}";
            go.transform.SetParent(transform);
            go.transform.localScale = Vector3.one * sphereRadius * 2f;
            go.GetComponent<Renderer>().material = mat;

            // No physics — purely visual
            Destroy(go.GetComponent<Collider>());

            go.SetActive(false);
            _spheres[i] = go;
        }

        Debug.Log("[HandVisualizer] Created 21 landmark spheres");
    }

    /// MediaPipe 정규화 좌표(x∈[0,1], y∈[0,1])를 카메라 뷰포트에 투영.
    /// 손 크기(웹캠 거리 프록시)에 따라 depth를 조절: 가까울수록 더 멀리(작게) 렌더링.
    public void UpdateScreenLandmarks(Vector3[] rawLandmarks, Camera cam)
    {
        bool valid = rawLandmarks != null && rawLandmarks.Length == LandmarkCount && cam != null;
        for (int i = 0; i < LandmarkCount; i++)
            _spheres[i].SetActive(valid);

        if (!valid) return;

        // 손목(0)과 중간손가락MCP(9) 거리 = 손의 겉보기 크기 → 웹캠 거리 추정
        var w = rawLandmarks[0];
        var m = rawLandmarks[9];
        float handSize = Mathf.Sqrt((w.x - m.x) * (w.x - m.x) + (w.y - m.y) * (w.y - m.y));
        // 클수록 가깝다 → depth를 더 크게 → Unity에서 더 멀리(작게)
        float depth = screenDepth + handSize * depthByHandSize;

        // 손바닥 중심(중지MCP=9)을 기준으로 점들을 수축: 가까울수록 작아 보임
        float pcx = rawLandmarks[9].x;
        float pcy = 1f - rawLandmarks[9].y;
        float spread = Mathf.Clamp01(1f - handSize * spreadShrink);

        // 디버그: handSize / spread 확인 (30프레임마다)
        if (Time.frameCount % 30 == 0)
            Debug.Log($"[HandViz] handSize={handSize:F3}  spread={spread:F2}  depth={depth:F2}");

        for (int i = 0; i < LandmarkCount; i++)
        {
            float vx = rawLandmarks[i].x;
            float vy = 1f - rawLandmarks[i].y;
            // 손바닥 중심으로 수축
            float sx = pcx + (vx - pcx) * spread;
            float sy = pcy + (vy - pcy) * spread;
            _spheres[i].transform.position = cam.ViewportToWorldPoint(new Vector3(sx, sy, depth));
        }
    }

    /// 월드 좌표로 직접 배치 (레거시, 현재 미사용).
    public void UpdateLandmarks(Vector3[] positions)
    {
        bool valid = positions != null && positions.Length == LandmarkCount;
        for (int i = 0; i < LandmarkCount; i++)
        {
            _spheres[i].SetActive(valid);
            if (valid)
                _spheres[i].transform.position = positions[i];
        }
    }

    /// 손 dot이 현재 화면에 표시 중인지.
    public bool IsHandVisible => _spheres != null && _spheres.Length > 0 && _spheres[0].activeSelf;

    /// 특정 랜드마크 dot의 월드 위치를 반환. 비활성이면 (0,-100,0) 반환.
    public Vector3 GetLandmarkWorldPosition(int index)
    {
        if (_spheres == null || index < 0 || index >= _spheres.Length || !_spheres[index].activeSelf)
            return new Vector3(0f, -100f, 0f);
        return _spheres[index].transform.position;
    }
}
