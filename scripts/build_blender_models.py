"""Build RoboShot's original Blender models, animated GLBs and editable .blend.

Execute inside Blender, preferably via Blender MCP execute_code. All helper coordinates
are X forward, Y up, Z lateral, in metres; conversion to Blender is (X,-Z,Y),
so the exported glTF has precisely the Three.js coordinate system.
Existing Blender scenes and user objects are preserved in their own scenes.
"""
import bpy
import math
import json
import os
from mathutils import Vector, Quaternion, Matrix

if '__file__' not in globals():
    raise RuntimeError('Execute this saved authoring script with __file__ set (the MCP bridge does this automatically).')
PROJECT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MODEL_DIR = os.path.join(PROJECT, 'public', 'models')
ASSET_DIR = os.path.join(PROJECT, 'assets')
os.makedirs(MODEL_DIR, exist_ok=True)
os.makedirs(ASSET_DIR, exist_ok=True)

scene = bpy.data.scenes.new('RoboShot 3D Lab - Original Models')
bpy.context.window.scene = scene
scene.unit_settings.system = 'METRIC'
scene.unit_settings.scale_length = 1.0
scene.render.fps = 60
scene.frame_start = 1
scene.frame_end = 91

def vec(p):
    return Vector((p[0], -p[2], p[1]))

def mat(name, color, metallic=0, roughness=.5, alpha=1, emissive=0):
    m = bpy.data.materials.new('RS_' + name)
    m.use_nodes = True
    bsdf = next((n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'), None)
    if bsdf is None: bsdf = m.node_tree.nodes.new('ShaderNodeBsdfPrincipled')
    output = next((n for n in m.node_tree.nodes if n.type == 'OUTPUT_MATERIAL'), None)
    if output is None: output = m.node_tree.nodes.new('ShaderNodeOutputMaterial')
    m.node_tree.links.new(bsdf.outputs['BSDF'], output.inputs['Surface'])
    rgb = tuple(int(color[i:i+2], 16) / 255 for i in (0,2,4))
    # Color constants are sRGB; Blender node input expects linear RGB.
    linear = tuple(c / 12.92 if c <= .04045 else ((c + .055) / 1.055)**2.4 for c in rgb)
    bsdf.inputs['Base Color'].default_value = (*linear, alpha)
    bsdf.inputs['Metallic'].default_value = metallic
    bsdf.inputs['Roughness'].default_value = roughness
    bsdf.inputs['Alpha'].default_value = alpha
    if emissive:
        emission = bsdf.inputs.get('Emission Color') or bsdf.inputs.get('Emission')
        if emission: emission.default_value = (*linear, 1)
        strength = bsdf.inputs.get('Emission Strength')
        if strength: strength.default_value = emissive
    if alpha < 1:
        if hasattr(m, 'surface_render_method'): m.surface_render_method = 'DITHERED'
        elif hasattr(m, 'blend_method'): m.blend_method = 'BLEND'
        m.use_nodes = True
    m.diffuse_color = (*linear, alpha)
    return m

M = {
    'armor': mat('Ceramic titanium armor', 'd9e4e7', .55, .34),
    'white': mat('Porcelain marking', 'f2f3ed', .18, .58),
    'dark': mat('Graphite joint housing', '18272e', .7, .37),
    'rubber': mat('Rubber soles', '10191e', 0, .8),
    'grip': mat('Palm grip elastomer', '253536', 0, .93),
    'metal': mat('Brushed steel', '647e88', .85, .27),
    'teal': mat('Optical cyan', '36d9c8', .4, .32, emissive=.2),
    'blue': mat('Deep teal casing', '164351', .35, .55),
    'lens': mat('Sensor glass', '071a23', .75, .13),
    'orange': mat('Regulation orange rim', 'e96126', .15, .54),
    'line': mat('Court painted lines', 'd6e5e2', 0, .85),
    'net': mat('Woven net', 'dbe4de', 0, .95),
    'glass': mat('Backboard glass', 'd1e8ea', .05, .12, .19),
}

def group(name, parent=None, p=(0,0,0)):
    o = bpy.data.objects.new(name, None)
    scene.collection.objects.link(o)
    o.parent = parent
    o.location = vec(p)
    return o

def finish(o, name, parent, material, p=None):
    o.name = name
    o.parent = parent
    if p is not None: o.location = vec(p)
    o.data.materials.append(M.get(material, material))
    return o

def box(parent, size, p, material='armor', bevel=0, name='Armor panel'):
    bpy.ops.mesh.primitive_cube_add(size=1)
    o = bpy.context.object
    o.dimensions = (size[0], size[2], size[1])
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    finish(o, name, parent, material, p)
    if bevel:
        mod = o.modifiers.new('Machined edge radius', 'BEVEL')
        mod.width = bevel
        mod.segments = 3
        mod.affect = 'EDGES'
        o.modifiers.new('Weighted normals', 'WEIGHTED_NORMAL')
    return o

def sphere(parent, radius, p, material='metal', scale=(1,1,1), name='Spherical joint'):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=20, ring_count=12, radius=radius)
    o = finish(bpy.context.object, name, parent, material, p)
    o.scale = (scale[0], scale[2], scale[1])
    for polygon in o.data.polygons: polygon.use_smooth = True
    return o

def cylinder(parent, radius, length, p, material='metal', axis='y', name='Joint axle'):
    bpy.ops.mesh.primitive_cylinder_add(vertices=20, radius=radius, depth=length)
    o = finish(bpy.context.object, name, parent, material, p)
    if axis == 'x': o.rotation_euler.y = math.pi/2
    if axis == 'z': o.rotation_euler.x = math.pi/2
    for polygon in o.data.polygons: polygon.use_smooth = len(polygon.vertices) == 4
    return o

def rod(parent, a, b, radius, material='metal', name='Support'):
    av, bv = vec(a), vec(b)
    o = cylinder(parent, radius, (bv-av).length, (0,0,0), material, name=name)
    o.location = (av+bv)/2
    o.rotation_mode = 'QUATERNION'
    o.rotation_quaternion = (bv-av).to_track_quat('Z','Y')
    return o

def shooting_hand(elbow, side):
    """An upright contact grip, with a spherical palm pad and curved fingers."""
    suffix='left' if side < 0 else 'right'
    ball=Vector((.43,2.0,0))  # Robot origin is X=-0.43 in the web scene.
    normal=Vector((.12,.32,-side*.94)).normalized()
    centre=ball-normal*.145
    shoulder_q=Quaternion((1,0,0),-side*.40) @ Quaternion((0,1,0),-1.65)
    elbow_q=Quaternion((0,1,0),-1.35)
    parent_ready=(Matrix.Translation(vec((.01,1.51,side*.29))) @ shoulder_q.to_matrix().to_4x4()
                  @ Matrix.Translation(vec((0,-.31,0))) @ elbow_q.to_matrix().to_4x4())
    direction=parent_ready.to_3x3() @ vec((0,-1,0))
    forearm=Vector((direction.x,direction.z,-direction.y)).normalized()
    along=(forearm-normal*forearm.dot(normal)).normalized()
    across=along.cross(normal).normalized()
    basis=Matrix((vec(along),-vec(across),vec(normal))).transposed().to_4x4()
    basis.translation=vec(centre)
    wrist=group('wrist_grip_'+suffix,elbow)
    wrist.rotation_mode='QUATERNION'
    wrist.matrix_local=parent_ready.inverted() @ basis
    wrist['gripSide']=side
    wrist['pose']='Upright tangent grip; replaces the previous fixed180degree roll'
    hand=group('palm_'+suffix,wrist)
    hand['gripSurface']='local +Y in glTF; dorsal armor is local -Y'
    hand['orientationRevision']='Contact grip v5, pad follows the ball surface'
    cylinder(elbow,.052,.100,(0,-.310,0),'armor','y','Wrist cuff '+suffix)
    wrist_in_hand=basis.inverted() @ (parent_ready @ vec((0,-.34,0)))
    wrist_local=(wrist_in_hand.x,wrist_in_hand.z,-wrist_in_hand.y)
    sphere(wrist,.046,wrist_local,'dark',name='Wrist ball joint '+suffix)
    rod(wrist,wrist_local,(-.040,-.014,0),.033,'armor','Covered wrist heel '+suffix)
    sphere(wrist,.033,(-.040,-.014,0),'armor',name='Rounded wrist heel '+suffix)
    box(hand,(.083,.038,.096),(0,0,0),'dark',.013,'Palm frame '+suffix)
    # Concave pad surface follows the actual0.12m ball with0.5mm clearance.
    count=9;vertices=[];faces=[]
    for layer in range(2):
        for j in range(count):
            z=-.041+.082*j/(count-1)
            for i in range(count):
                x=-.035+.070*i/(count-1)
                y=.145-math.sqrt(.1205**2-x*x-z*z) if layer==0 else .0185
                vertices.append(vec((x,y,z)))
    n=count*count
    for j in range(count-1):
        for i in range(count-1):
            a=j*count+i;b=a+1;c=a+count+1;d=a+count
            faces.append((a,d,c,b));faces.append((a+n,b+n,c+n,d+n))
    perimeter=list(range(count))+[j*count+count-1 for j in range(1,count)]+list(range(n-2,n-count-1,-1))+[j*count for j in range(count-2,0,-1)]
    for i,a in enumerate(perimeter):
        b=perimeter[(i+1)%len(perimeter)];faces.append((a,b,b+n,a+n))
    data=bpy.data.meshes.new('Concave contact pad '+suffix);data.from_pydata(vertices,[],faces);data.update()
    pad=bpy.data.objects.new('Palm grip surface '+suffix,data);scene.collection.objects.link(pad)
    finish(pad,pad.name,hand,'grip',(0,0,0))
    for polygon in data.polygons:polygon.use_smooth=True
    box(hand,(.070,.014,.080),(0,-.024,0),'armor',.006,'Dorsal hand armor '+suffix)
    box(hand,(.021,.003,.015),(-.022,-.033,0),'teal',.001,'Dorsal status light '+suffix)

    def digit(points,radius,name,material='armor'):
        curve=bpy.data.curves.new(name+' profile','CURVE');curve.dimensions='3D'
        curve.resolution_u=5;curve.bevel_depth=radius;curve.bevel_resolution=3;curve.use_fill_caps=True
        spline=curve.splines.new('BEZIER');spline.bezier_points.add(len(points)-1)
        for point,coordinate in zip(spline.bezier_points,points):
            point.co=vec(coordinate);point.handle_left_type='AUTO';point.handle_right_type='AUTO'
        temporary=bpy.data.objects.new(name+' profile',curve);scene.collection.objects.link(temporary)
        evaluated=temporary.evaluated_get(bpy.context.evaluated_depsgraph_get())
        data=bpy.data.meshes.new_from_object(evaluated)
        obj=bpy.data.objects.new(name,data);scene.collection.objects.link(obj)
        finish(obj,name,hand,material,(0,0,0))
        for polygon in data.polygons:polygon.use_smooth=True
        bpy.data.objects.remove(temporary,do_unlink=True);bpy.data.curves.remove(curve)
        sphere(hand,radius,points[-1],material,name=name+' rounded tip')

    # Four shorter continuous fingers have closed rounded tips, without loose
    # black hinge gaps or exposed cylindrical end faces.
    for f in range(4):
        z=(f-1.5)*.021
        points=[(x,.145-math.sqrt(.132**2-x*x-z*z),z) for x in (.034,.048,.064,.080)]
        digit(points,.0105,'Compact finger '+suffix+' '+str(f+1))
        outward=(Vector(points[-1])-Vector((0,.145,0))).normalized()
        pad_centre=Vector((0,.145,0))+outward*.124
        tip=sphere(hand,.01,pad_centre,'grip',(.8,.35,.8),'Finger tip pad '+suffix)
        tip.rotation_mode='QUATERNION';tip.rotation_quaternion=vec(outward).to_track_quat('Z','Y')
    # Anatomical opposition: thumb is +side along along×normal, toward the
    # robot/shooter in this two-handed grip, not toward the basket.
    thumb=[(x,.145-math.sqrt(.135**2-x*x-z*z),z) for x,z in [(-.024,side*.045),(-.006,side*.064),(.015,side*.073)]]
    digit(thumb,.0135,'Compact opposed thumb '+suffix)
    marker=group('palm_normal_'+suffix,hand,(0,.10,0))
    marker['purpose']='Grip surface normal points toward the held ball'
    group('grip_contact_'+suffix,hand,(0,.0245,0))
    group('grip_ball_center_'+suffix,hand,(0,.145,0))
    return wrist

def animate_contact_grips(grips,root):
    """Keep both hands on the same held ball during the0.65s preparation."""
    scene.frame_set(1);bpy.context.view_layer.update()
    ready_frames=[root.matrix_world.inverted() @ grip.matrix_world for grip in grips]
    release={}
    for frame in range(1,92):
        scene.frame_set(frame);bpy.context.view_layer.update()
        for grip,ready in zip(grips,ready_frames):
            if frame<=40:
                t=(frame-1)/60;dip=math.sin(math.pi*t/.65) if frame<40 else 0
                target=ready.copy();target.translation+=vec((.03*dip,-.12*dip,0))
                local=grip.parent.matrix_world.inverted() @ root.matrix_world @ target
                grip.matrix_local=local
                if frame==40:release[grip.name]=(grip.location.copy(),grip.rotation_quaternion.copy())
            else:
                grip.location,grip.rotation_quaternion=release[grip.name]
            grip.keyframe_insert(data_path='location',frame=frame,group='Contact grip')
            grip.keyframe_insert(data_path='rotation_quaternion',frame=frame,group='Contact grip')
    for grip in grips:
        action=grip.animation_data.action;action.name='RoboShot_Contact_'+grip.name
        curves=list(getattr(action,'fcurves',[]))
        for layer in getattr(action,'layers',[]):
            for strip in layer.strips:
                for bag in getattr(strip,'channelbags',[]):curves.extend(bag.fcurves)
        for curve in curves:
            for point in curve.keyframe_points:point.interpolation='LINEAR'
    scene.frame_set(1)

robot = group('RoboShot_Robot')
robot['units'] = 'metres'
robot['forward'] = '+X'
robot['source'] = 'Original Blender model authored through Blender MCP'
for side in (-1,1):
    z = side*.16
    box(robot, (.36,.10,.19), (.075,.075,z), 'dark', .022, 'Articulated foot sole')
    box(robot, (.27,.06,.17), (.09,.13,z), 'armor', .018, 'Foot armor')
    box(robot, (.035,.025,.14), (.22,.12,z), 'teal', .005, 'Foot light strip')
    cylinder(robot,.075,.16,(0,.21,z),'metal','z')
    box(robot,(.15,.29,.16),(-.035,.38,z),'armor',.025,'Shin shell')
    box(robot,(.035,.22,.11),(.052,.39,z),'blue',.009,'Shin inset')
    cylinder(robot,.09,.19,(-.04,.57,z),'dark','z')
    cylinder(robot,.048,.195,(-.04,.57,z),'teal','z')
    box(robot,(.18,.32,.19),(-.015,.77,z),'armor',.029,'Thigh shell')
    rod(robot,(-.10,.61,z+side*.095),(-.11,.89,z+side*.095),.017,'metal','Leg actuator')
    sphere(robot,.10,(0,.97,z),'dark')
box(robot,(.27,.18,.43),(0,1.03,0),'dark',.028,'Pelvis core')
box(robot,(.29,.13,.37),(.022,1.09,0),'armor',.022,'Pelvis armor')
cylinder(robot,.105,.12,(0,1.17,0))
box(robot,(.30,.37,.45),(0,1.39,0),'armor',.038,'Chest shell')
box(robot,(.06,.22,.34),(.175,1.41,0),'dark',.018,'Chest face')
box(robot,(.012,.023,.25),(.214,1.46,0),'teal',.004,'Status light bar')
box(robot,(.012,.035,.065),(.214,1.35,-.09),'white',.003,'Chest insignia')
box(robot,(.09,.23,.27),(-.19,1.39,0),'blue',.019,'Power pack')
for i in range(4): box(robot,(.015,.014,.20),(-.242,1.32+i*.04,0),'metal',0,'Rear ventilation')
cylinder(robot,.066,.10,(0,1.64,0),'dark')
sphere(robot,.18,(.018,1.80,0),'armor',(.87,.92,1),'Helmet shell')
box(robot,(.11,.105,.30),(.13,1.81,0),'lens',.023,'Sensor visor')
box(robot,(.012,.016,.23),(.192,1.819,0),'teal',.004,'Vision scanning band')
joints=[]
grips=[]
for side in (-1,1):
    suffix = 'left' if side < 0 else 'right'
    cylinder(robot,.057,.025,(.015,1.79,side*.173),'dark','z','Audio sensor housing')
    cylinder(robot,.025,.029,(.015,1.79,side*.173),'teal','z','Audio sensor')
    sphere(robot,.021,(.195,1.81,side*.09),'teal',name='Stereo optical sensor')
    shoulder = group('shoulder_'+suffix,robot,(.01,1.51,side*.29))
    sphere(shoulder,.105,(0,0,0),'dark')
    cylinder(shoulder,.067,.22,(0,0,0),'armor','z')
    cylinder(shoulder,.03,.225,(0,0,0),'teal','z')
    box(shoulder,(.15,.24,.15),(0,-.17,0),'armor',.025,'Upper arm shell')
    box(shoulder,(.025,.17,.07),(.085,-.17,0),'blue',.005,'Arm inset')
    elbow = group('elbow_'+suffix,shoulder,(0,-.31,0))
    cylinder(elbow,.068,.17,(0,0,0),'dark','z')
    cylinder(elbow,.035,.177,(0,0,0),'metal','z')
    box(elbow,(.12,.24,.14),(0,-.155,0),'armor',.024,'Forearm shell')
    rod(elbow,(-.063,-.03,0),(-.063,-.25,0),.016,'metal','Forearm piston')
    box(elbow,(.012,.11,.045),(.07,-.15,0),'teal',.003,'Forearm light')
    grips.append(shooting_hand(elbow,side))
    # Upper arms reach forward, with the elbow below the ball; positive elbow
    # flexion lifts the forearms. Extension reduces flexion without hyperextension.
    joints.extend([(shoulder,[1.65,1.40,1.65,2.18,2.35,2.32]),(elbow,[1.35,1.50,1.35,.40,.15,.18])])
for joint, angles in joints:
    joint.rotation_mode='QUATERNION'
    for frame, angle in zip((1,17,39,55,69,91),angles):
        inward = (-.40 if joint.name.endswith('right') else .40) if joint.name.startswith('shoulder') else 0
        joint.rotation_quaternion=Quaternion((1,0,0),inward) @ Quaternion((0,1,0),-angle)
        joint.keyframe_insert(data_path='rotation_quaternion', frame=frame, group='RoboShot Shooting')
    if joint.animation_data and joint.animation_data.action:
        joint.animation_data.action.name='RoboShot_Shooting_'+joint.name
scene.frame_set(1)
animate_contact_grips(grips,robot)

court=group('RoboShot_Court')
court['units']='metres'
woods=[mat('Maple plank '+str(i), color, .03, .61) for i,color in enumerate(['96795a','a48864','9b805c','a58a68','92795b'])]
box(court,(17.5,.18,14.2),(3.4,-.12,0),'dark',.03,'Court foundation')
for i in range(58):
    box(court,(17.35,.04,.236),(3.4,-.009,-6.85+i*.239),woods[(i*13+3)%5],0,'Maple court plank')
seam=mat('Maple endgrain seams','786144',0,.8)
for i in range(58):
    for j in range(5):
        box(court,(.007,.003,.235),(-4.3+j*3.3+(i%3)*.8,.014,-6.85+i*.239),seam,0,'Staggered plank joint')
key=mat('Painted training key','2d6669',0,.75)
box(court,(5.65,.006,4.9),(6.28,.017,0),key,0,'Training key')

def line(a,b,width=.035):
    dx,dz=b[0]-a[0],b[1]-a[1]
    o=box(court,(math.hypot(dx,dz),.008,width),((a[0]+b[0])/2,.025,(a[1]+b[1])/2),'line',0,'Court stripe')
    o.rotation_euler.z=-math.atan2(dz,dx)

def arc(cx,cz,r,start,end):
    previous=None
    for i in range(73):
        a=start+(end-start)*i/72
        p=(cx+math.cos(a)*r,cz+math.sin(a)*r)
        if previous: line(previous,p,.036)
        previous=p

boundary=[(-4.8,-6.55),(10.9,-6.55),(10.9,6.55),(-4.8,6.55),(-4.8,-6.55)]
for i in range(1,len(boundary)):line(boundary[i-1],boundary[i],.045)
arc(-4.8,0,1.8,-math.pi/2,math.pi/2)
line((3.45,-2.45),(9.1,-2.45));line((3.45,2.45),(9.1,2.45));line((3.45,-2.45),(3.45,2.45))
arc(3.45,0,1.8,math.pi/2,math.pi*1.5)
arc(8.3,0,6.25,math.pi*.39,math.pi*1.61)
arc(8.3,0,1.25,math.pi/2,math.pi*1.5)

hoop=group('RoboShot_Hoop')
hoop['units']='metres';hoop['hoopHeight']=3.05;hoop['innerRimRadius']=.225
bpy.ops.mesh.primitive_torus_add(major_segments=72,minor_segments=10,major_radius=.2375,minor_radius=.0125)
rim=finish(bpy.context.object,'Rim_3_05m_450mm',hoop,'orange',(0,3.05,0))
for polygon in rim.data.polygons:polygon.use_smooth=True
box(hoop,(.20,.026,.12),(.29,3.05,0),'orange',.006,'Rim backplate')
box(hoop,(.025,1.05,1.80),(.39,3.53,0),'glass',.005,'Tempered glass backboard')
for z in (-.90,.90):box(hoop,(.052,1.10,.035),(.39,3.53,z),'white',.005,'Backboard frame')
for y in (3.005,4.055):box(hoop,(.052,.035,1.83),(.39,y,0),'white',.005,'Backboard frame')
for z in (-.295,.295):box(hoop,(.014,.45,.022),(.369,3.32,z),'white',0,'Backboard target')
for y in (3.095,3.545):box(hoop,(.014,.022,.61),(.369,y,0),'white',0,'Backboard target')
box(hoop,(.075,.12,1.82),(.40,2.98,0),'blue',.02,'Protective backboard padding')
box(hoop,(1.10,.22,1.05),(1.62,.13,0),'dark',.04,'Weighted goal base')
box(hoop,(.52,2.55,.42),(1.75,1.44,0),'blue',.035,'Goal support mast')
box(hoop,(.08,1.6,.47),(1.45,1.12,0),'dark',.025,'Goal safety padding')
for z in (-.14,.14):
    rod(hoop,(1.75,2.65,z),(.62,3.75,z),.065,'metal','Cantilever strut')
    rod(hoop,(.64,3.75,z),(.47,3.75,z),.06,'metal','Board mount')
for z in (-.47,.47):
    for x in (1.25,1.96):cylinder(hoop,.09,.07,(x,.10,z),'rubber','z','Base wheel')
for layer in range(5):
    r1,r2=.224-layer*.019,.224-(layer+1)*.019
    y1=3.035-layer*.085;y2=y1-.085
    for i in range(12):
        a=i/12*math.pi*2+(layer%2)*math.pi/12
        for direction in (-1,1):
            b=a+direction*math.pi/12
            rod(hoop,(math.cos(a)*r1,y1,math.sin(a)*r1),(math.cos(b)*r2,y2,math.sin(b)*r2),.0033,'net','Diamond net cord')

def descendants(root):
    return [root]+[child for c in root.children for child in descendants(c)]

properties=bpy.ops.export_scene.gltf.get_rna_type().properties
keys=set(properties.keys())
report={'generator':'Blender '+bpy.app.version_string+' through Blender MCP','units':'metres','axes':{'forward':'+X','up':'+Y'},'models':{},'validation':{'hoopCentre':[0,3.05,0],'rimInnerDiameter':.45,'basketballRadius':.12,'modelScale':1,'robotForward':'+X optical visor'}}
for name,root in [('robot',robot),('court',court),('hoop',hoop)]:
    bpy.ops.object.select_all(action='DESELECT')
    for obj in descendants(root):obj.select_set(True)
    bpy.context.view_layer.objects.active=root
    filepath=os.path.join(MODEL_DIR,name+'.glb')
    options={'filepath':filepath,'export_format':'GLB','use_selection':True,'export_yup':True,'export_apply':True,'export_animations':name=='robot','export_extras':True}
    if 'use_active_scene' in keys:options['use_active_scene']=True
    if 'export_animation_mode' in keys:
        allowed={item.identifier for item in properties['export_animation_mode'].enum_items}
        if 'ACTIVE_ACTIONS' in allowed:options['export_animation_mode']='ACTIVE_ACTIONS'
    if 'export_nla_strips' in keys:options['export_nla_strips']=False
    if 'export_force_sampling' in keys:options['export_force_sampling']=True
    if 'export_anim_slide_to_zero' in keys:options['export_anim_slide_to_zero']=True
    bpy.ops.export_scene.gltf(**options)
    report['models'][name]={'bytes':os.path.getsize(filepath),'meshes':sum(o.type=='MESH' for o in descendants(root)),'path':name+'.glb'}

# Arrange the editable Blender scene in the same initial configuration as the web app.
robot.location=vec((-.43,0,0));court.location=vec((-4.3,0,0));hoop.location=vec((4,0,0))
for name,location,energy,size in [('Key',(-2,8,5),1600,6),('Fill',(6,6,-4),900,5)]:
    light=bpy.data.lights.new('RS_'+name,'AREA');light.energy=energy;light.shape='DISK';light.size=size
    obj=bpy.data.objects.new('RS_'+name,light);scene.collection.objects.link(obj);obj.location=vec(location)
    obj.rotation_euler=(vec((2,1,0))-obj.location).to_track_quat('-Z','Y').to_euler()
camera_data=bpy.data.cameras.new('RoboShot presentation camera');camera=bpy.data.objects.new('RoboShot presentation camera',camera_data);scene.collection.objects.link(camera)
camera.location=vec((-4.2,6,9));camera.rotation_euler=(vec((1.7,1.4,0))-camera.location).to_track_quat('-Z','Y').to_euler();camera_data.lens=43;scene.camera=camera
scene.world=bpy.data.worlds.new('RoboShot studio world');scene.world.use_nodes=True
background=next((n for n in scene.world.node_tree.nodes if n.type=='BACKGROUND'),None)
if background is None:background=scene.world.node_tree.nodes.new('ShaderNodeBackground')
world_output=next((n for n in scene.world.node_tree.nodes if n.type=='OUTPUT_WORLD'),None)
if world_output is None:world_output=scene.world.node_tree.nodes.new('ShaderNodeOutputWorld')
scene.world.node_tree.links.new(background.outputs[0],world_output.inputs[0])
background.inputs[0].default_value=(.04,.07,.10,1);background.inputs[1].default_value=.5
scene.render.resolution_x=1600;scene.render.resolution_y=1000;scene.render.resolution_percentage=100
scene.frame_set(1)
blend_path=os.path.join(ASSET_DIR,'RoboShot-3D-Lab.blend')
bpy.ops.wm.save_as_mainfile(filepath=blend_path)
report['blendFile']='assets/RoboShot-3D-Lab.blend'
with open(os.path.join(MODEL_DIR,'model-info.json'),'w',encoding='utf-8') as f:json.dump(report,f,ensure_ascii=False,indent=2)
print('ROBOSHOT_MODEL_EXPORT_COMPLETE '+json.dumps(report,ensure_ascii=False))
