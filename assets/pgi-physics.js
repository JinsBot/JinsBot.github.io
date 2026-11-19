/* PGI's decorative Jenga model. Values are for this UI, not measured hardware. */
(function (root) {
  'use strict';
  const C=root.PGIPhysics;
  if(!C)return;
  root.createPGIJengaWorld=function(){
    const world=new C.World({gravity:new C.Vec3(0,-18,0),allowSleep:false});
    world.solver.iterations=45;
    world.solver.tolerance=1e-7;
    world.broadphase=new C.SAPBroadphase(world);
    const wood=new C.Material('wood'),floor=new C.Material('floor');
    world.addContactMaterial(new C.ContactMaterial(wood,wood,{
      friction:.0028,restitution:.025,contactEquationStiffness:1e8,
      contactEquationRelaxation:4,frictionEquationStiffness:1e8,frictionEquationRelaxation:4
    }));
    world.addContactMaterial(new C.ContactMaterial(wood,floor,{friction:.034,restitution:.025}));
    const ground=new C.Body({mass:0,material:floor,shape:new C.Plane()});
    ground.quaternion.setFromEuler(-Math.PI/2,0,0);world.addBody(ground);
    const size=[3,.51,.97],blocks=[];
    for(let layer=0;layer<7;layer++)for(let slot=0;slot<3;slot++){
      const body=new C.Body({mass:1,material:wood,allowSleep:false,
        shape:new C.Box(new C.Vec3(...size.map(v=>v/2))),
        linearDamping:.04,angularDamping:.08,sleepSpeedLimit:.08,sleepTimeLimit:.65
      });
      const rotation=layer%2?Math.PI/2:0;
      body.quaternion.setFromAxisAngle(new C.Vec3(0,1,0),rotation);
      body.position.set(Math.sin(rotation)*(slot-1),.256+layer*.512,Math.cos(rotation)*(slot-1));
      world.addBody(body);blocks.push({body,layer,slot,seed:layer*7+slot*17});
    }
    const timestep=1/120;let quietTime=0;
    function reset(){
      quietTime=0;
      for(const {body,layer,slot} of blocks){
        const rotation=layer%2?Math.PI/2:0;
        body.position.set(Math.sin(rotation)*(slot-1),.256+layer*.512,Math.cos(rotation)*(slot-1));
        body.quaternion.setFromAxisAngle(new C.Vec3(0,1,0),rotation);
        body.velocity.setZero();body.angularVelocity.setZero();body.force.setZero();body.torque.setZero();
        body.aabbNeedsUpdate=true;body.wakeUp();
      }
      // Settle contacts before showing the initial configuration.
      for(let i=0;i<120;i++)world.step(timestep);
      for(const {body} of blocks)body.sleep();
    }
    function push(block,impulse,point){
      quietTime=0;
      // Wake resting supports too, so newly unsupported blocks can fall.
      for(const {body} of blocks)body.wakeUp();
      const body=block.body;
      const relative=point?new C.Vec3(...point).vsub(body.position):new C.Vec3();
      body.applyImpulse(new C.Vec3(...impulse),relative);
    }
    reset();
    return {world,blocks,size,timestep,reset,push,
      step(){
        world.step(timestep);
        // Sleep the entire settled pile together. An individual sleeping block
        // must not remain suspended when a supporting block is removed.
        const quiet=blocks.every(({body})=>body.velocity.length()<.08&&body.angularVelocity.length()<.12);
        quietTime=quiet?quietTime+timestep:0;
        if(quietTime>.8)for(const {body} of blocks)body.sleep();
      },
      sleeping(){return blocks.every(({body})=>body.sleepState===C.Body.SLEEPING)}
    };
  };
})(typeof window==='undefined'?globalThis:window);
