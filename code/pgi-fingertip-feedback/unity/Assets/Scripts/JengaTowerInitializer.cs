using System.Collections;
using UnityEngine;

public class JengaTowerInitializer : MonoBehaviour
{
    [SerializeField] private float normalLinearDamping  = 4f;
    [SerializeField] private float normalAngularDamping = 8f;
    [SerializeField] private int   settleFrames         = 12;

    private void Start()
    {
        StartCoroutine(InitBlocks());
    }

    private IEnumerator InitBlocks()
    {
        var blocks = GetComponentsInChildren<Rigidbody>();

        // 1) Kinematic 잠금 — Physics 접근 차단
        foreach (var rb in blocks)
            rb.isKinematic = true;

        yield return new WaitForFixedUpdate();
        yield return new WaitForFixedUpdate();

        // 2) Dynamic 전환 + 극한 damping으로 폭발 방지
        //    이 상태에서 Physics가 블록 간 contact를 실제로 등록
        foreach (var rb in blocks)
        {
            rb.isKinematic      = false;
            rb.linearVelocity   = Vector3.zero;
            rb.angularVelocity  = Vector3.zero;
            rb.linearDamping    = 200f;
            rb.angularDamping   = 200f;
        }

        // 3) contact 등록을 위해 추가 프레임 대기
        for (int i = 0; i < settleFrames; i++)
            yield return new WaitForFixedUpdate();

        // 4) 속도 정리 후 정상 damping 복원 — Sleep 없음
        //    지지받는 블록은 damping이 안정시키고, 공중 블록은 중력으로 자연낙하
        foreach (var rb in blocks)
        {
            rb.linearVelocity   = Vector3.zero;
            rb.angularVelocity  = Vector3.zero;
            rb.linearDamping    = normalLinearDamping;
            rb.angularDamping   = normalAngularDamping;
        }

        Debug.Log($"[JengaTower] {blocks.Length} blocks initialized and sleeping.");
    }
}
