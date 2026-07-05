import pygame as pg
from math import sqrt, sin, cos, radians
import random

# --- Window Setup ---
ww, wh = 1000, 1000 
pg.init()
window = pg.display.set_mode((ww, wh))
clock = pg.time.Clock()
fps = 60
dt = 1/fps 

# --- Camera System ---
class Camera:
    def __init__(self):
        self.pos = [0, -5, -15]  # Back and slightly up to view the floor
        self.rot = [0, 0, 0]     # Pitch (X) and Yaw (Y) rotations
        self.speed = 10
        self.rot_speed = 2
        
    def get_matrix(self):
        # Calculates rotation matrix combining Pitch and Yaw
        ax, ay = radians(self.rot[0]), radians(self.rot[1])
        
        # Precompute trig functions
        cx, sx = cos(ax), sin(ax)
        cy, sy = cos(ay), sin(ay)
        
        # Combined rotation matrix (Yaw * Pitch)
        return [
            [cy, 0, sy],
            [sx*sy, cx, -sx*cy],
            [-cx*sy, sx, cx*cy]
        ]
        
    def update(self, keys):
        # Camera Movement (Relative to facing direction)
        ay = radians(self.rot[1])
        forward = [sin(ay), 0, cos(ay)]
        right = [cos(ay), 0, -sin(ay)]
        
        if keys[pg.K_w]:  # Move Forward
            for i in range(3): self.pos[i] += forward[i] * self.speed * dt
        if keys[pg.K_s]:  # Move Backward
            for i in range(3): self.pos[i] -= forward[i] * self.speed * dt
        if keys[pg.K_a]:  # Move Left
            for i in range(3): self.pos[i] -= right[i] * self.speed * dt
        if keys[pg.K_d]:  # Move Right
            for i in range(3): self.pos[i] += right[i] * self.speed * dt
        if keys[pg.K_SPACE]:  # Move Up
            self.pos[1] -= self.speed * dt
        if keys[pg.K_LSHIFT]: # Move Down
            self.pos[1] += self.speed * dt
            
        # Camera Rotation (Arrow Keys)
        if keys[pg.K_UP]:    self.rot[0] -= self.rot_speed
        if keys[pg.K_DOWN]:  self.rot[0] += self.rot_speed
        if keys[pg.K_LEFT]:  self.rot[1] -= self.rot_speed
        if keys[pg.K_RIGHT]: self.rot[1] += self.rot_speed

# --- Physics Mesh System ---
class Mesh:
    def __init__(self):
        self.rmatrix = [] 
        self.positions = []
        self.velocities = []
        self.color = (random.randint(100, 255), random.randint(100, 255), random.randint(100, 255))
    
    def update(self, dt):
        gravity = 15.0
        floor_y = 3.0  # Physical floor position
        damping = 0.6  # Energy loss on bounce
        
        # 1. Apply Gravity and update positions
        for i in range(len(self.positions)):
            self.velocities[i][1] += gravity * dt
            for j in range(3):
                self.positions[i][j] += self.velocities[i][j] * dt 

        # 2. Distance Constraints Solver (Verlet relaxation)
        # Keeps the card rigid so it doesn't distort or turn inside out
        for _ in range(4):  
            for i in range(len(self.positions)):
                for j in range(i + 1, len(self.positions)):
                    target_dist = self.rmatrix[i][j]
                    if target_dist == 0: continue
                    
                    dx = self.positions[i][0] - self.positions[j][0]
                    dy = self.positions[i][1] - self.positions[j][1]
                    dz = self.positions[i][2] - self.positions[j][2]
                    current_dist = sqrt(dx*dx + dy*dy + dz*dz)
                    if current_dist == 0: current_dist = 0.01
                    
                    diff = target_dist - current_dist
                    percent = (diff / current_dist) * 0.5
                    
                    offset = [dx * percent, dy * percent, dz * percent]
                    for k in range(3):
                        self.positions[i][k] += offset[k]
                        self.positions[j][k] -= offset[k]

        # 3. Floor Collision & Damping Bounces
        for i in range(len(self.positions)):
            if self.positions[i][1] >= floor_y:
                self.positions[i][1] = floor_y
                if self.velocities[i][1] > 0:
                    self.velocities[i][1] = -self.velocities[i][1] * damping
                    # Apply friction/damping to X and Z sliding velocities on hit
                    self.velocities[i][0] *= damping
                    self.velocities[i][2] *= damping

    def project(self, cpos, cmatrix):
        projecteds = []
        for point in self.positions:
            # Transform relative to camera position
            np = [point[i] - cpos[i] for i in range(3)]
            # Rotate via camera matrix
            pp = [sum([np[j] * cmatrix[i][j] for j in range(3)]) for i in range(3)]
            
            # Clip points that are behind the camera viewport
            if pp[2] <= 0.2: 
                return None
                
            # Perspective Projection 
            fov_scale = 800  # Controls the focal lens strength
            projected = [
                (pp[0] / pp[2]) * fov_scale + (ww / 2),
                (pp[1] / pp[2]) * fov_scale + (wh / 2)
            ]
            projecteds.append(projected)
        return projecteds
    
    @staticmethod
    def spawn_random_card(center):
        out = Mesh()
        
        # Local space 2x2 flat card corners
        local_pos = [[-1, 0, -1], [-1, 0, 1], [1, 0, 1], [1, 0, -1]]
        
        # Generate random 3D rotations (Angles in Radians)
        ax, ay, az = radians(random.uniform(0, 360)), radians(random.uniform(0, 360)), radians(random.uniform(0, 360))
        
        # Simple Euler Rotation Matrix calculations
        for p in local_pos:
            # Rotate X
            y1 = p[1]*cos(ax) - p[2]*sin(ax)
            z1 = p[1]*sin(ax) + p[2]*cos(ax)
            # Rotate Y
            x2 = p[0]*cos(ay) + z1*sin(ay)
            z2 = -p[0]*sin(ay) + z1*cos(ay)
            # Rotate Z
            x3 = x2*cos(az) - y1*sin(az)
            y3 = x2*sin(az) + y1*cos(az)
            
            # Shift translated final position into world space
            out.positions.append([x3 + center[0], y3 + center[1], z2 + center[2]])
            
        out.velocities = [[random.uniform(-1, 1), random.uniform(-2, 0), random.uniform(-1, 1)] for _ in range(4)]
        out.rmatrix = [
            [0, 2, sqrt(8), 2], 
            [2, 0, 2, sqrt(8)], 
            [sqrt(8), 2, 0, 2], 
            [2, sqrt(8), 2, 0]
        ]
        return out

# --- Main Runtime Loop ---
def main():
    cam = Camera()
    cards = []
    
    # Spawn a few initial random cards up high
    for _ in range(100):
        cards.append(Mesh.spawn_random_card([random.uniform(-4, 4), random.uniform(-10, -5), random.uniform(-4, 4)]))

    running = True
    while running:
        # Handle input keys
        keys = pg.key.get_pressed()
        cam.update(keys)
        
        for event in pg.event.get():
            if event.type == pg.QUIT:
                running = False 
            # Press 'G' to manually spawn more falling cards!
            if event.type == pg.KEYDOWN and event.key == pg.K_g:
                cards.append(Mesh.spawn_random_card([random.uniform(-3, 3), -12, random.uniform(-3, 3)]))

        # Clear Screen
        window.fill((15, 15, 20))

        # Update & Draw Mesh Cards
        cmatrix = cam.get_matrix()
        for card in cards:
            card.update(dt)
            screen_pts = card.project(cam.pos, cmatrix)
            
            # Draw if the card is in front of the camera viewport bounds
            if screen_pts:
                # Convert floats to screen integer tuples
                draw_pts = [(int(pt[0]), int(pt[1])) for pt in screen_pts]
                pg.draw.polygon(window, card.color, draw_pts)
                pg.draw.polygon(window, (255, 255, 255), draw_pts, 2) # White outline

        # Frame Updates
        pg.display.flip()
        clock.tick(fps)
        
    pg.quit()

if __name__ == "__main__":
    main()