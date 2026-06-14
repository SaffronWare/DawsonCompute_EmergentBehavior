import pygame 
import random
from pygame import Vector2 
from random import randint as r
import math
from collections import defaultdict

import numpy as np

pygame.init()
window_dimensions = (1000,750)
clock = pygame.time.Clock()
timer1 = 0
timer2 = 0

max_dist = math.sqrt(window_dimensions[0]**2 + window_dimensions[1]**2)

num_of_ants = 1
wander_strength = 0.15
window = pygame.display.set_mode(window_dimensions)
pheromone_time_interval = 0.1
evaporation_rate = 0.15
evaporation_time_interval = 0.5
follow_strength = 2
nest_position = Vector2(100,120)
nest_radius = 60
fps = 120
speedup = 1
dt = speedup/fps

grid_cell_size = 5
grid_w = window_dimensions[0] // grid_cell_size
grid_l = window_dimensions[1] // grid_cell_size
pheromone_grid = np.zeros((grid_w,grid_l), dtype= np.float32)
pheromone_grid_2 = np.zeros((grid_w,grid_l), dtype= np.float32)

obstacles = set()  # stores grid cells that are blocked

def add_rect_obstacle(x, y, w, h):
    for cx in range(x, x + w, grid_cell_size):
        for cy in range(y, y + h, grid_cell_size):
            gx = cx // grid_cell_size
            gy = cy // grid_cell_size
            obstacles.add((gx, gy))

def add_circle_obstacle(cx, cy, radius):
    for x in range(cx - radius, cx + radius):
        for y in range(cy - radius, cy + radius):
            if (x - cx)**2 + (y - cy)**2 <= radius**2:
                gx = x // grid_cell_size
                gy = y // grid_cell_size
                obstacles.add((gx, gy))

def draw_obstacles():
    for cell in obstacles:
        pygame.draw.rect(window, (100, 100, 100),
            (cell[0] * grid_cell_size, cell[1] * grid_cell_size,
             grid_cell_size, grid_cell_size))
        
def evaporate_grid():
    global pheromone_grid, pheromone_grid_2
    factor = 1 - evaporation_rate
    pheromone_grid *= factor
    pheromone_grid_2 *= factor
    pheromone_grid[pheromone_grid < 0.01] = 0.0
    pheromone_grid_2[pheromone_grid_2 < 0.01] = 0.0


def draw_pheromones():
    for x in range(grid_w):
        for y in range(grid_l):
            strength = pheromone_grid[x][y]
            strength_2 = pheromone_grid_2[x][y]
            if strength > 0.01 or strength_2 > 0.01:
                color = (
                    int(255 * strength_2),  # red channel  -> food trail
                    0,
                    int(255 * strength),    # blue channel -> home trail
                )
                pygame.draw.rect(window, color,
                    (x * grid_cell_size, y * grid_cell_size, grid_cell_size, grid_cell_size))
                
def draw_nest():
    pygame.draw.circle(window, (150,75,0), nest_position, nest_radius)


food_bucket_size = 100
food_bucket = defaultdict(set)           
food_grid_position = Vector2(750,550)
food_set = set()

for x in range(0,150,grid_cell_size * 2):
    for y in range(0,150,grid_cell_size * 2):
        fx = int((food_grid_position.x + x) // grid_cell_size)
        fy = int((food_grid_position.y + y) // grid_cell_size)
        food_set.add((fx,fy))

for food in food_set:
    bx = (food[0] * grid_cell_size) // food_bucket_size
    by = (food[1] * grid_cell_size) // food_bucket_size
    food_bucket[(bx,by)].add(food)

def get_food_collection(pos):
    bx = pos[0] // food_bucket_size
    by = pos[1] // food_bucket_size
    result = []
    for dx in (-1,0,1):
        for dy in (-1,0,1):
            result.append(food_bucket.get((bx + dx, by + dy), set()))
    return result


def draw_food_grid():
    for set in food_bucket:
        collection = food_bucket[set]
        for food in collection:
            pygame.draw.rect(window, (0,255,0),
                (food[0] * grid_cell_size, food[1] * grid_cell_size, grid_cell_size, grid_cell_size))


                
class Ant:
    def __init__(self, start_point, max_speed = 200, wander_strength = wander_strength, steer_strength = 500):
        self.position = start_point
        self.max_speed = max_speed
        self.wander_strength = wander_strength
        self.steer_strength = steer_strength

        self.velocity = Vector2()
        self.desired_direction = Vector2()
        self.acceleration = Vector2()
        self.has_food = False

        self.fov_radius = 150    # how far the ant can see
        self.fov_angle = math.pi / 2  # 90° cone in front (±45° from heading)
        self.food_target = None 

    def sample_pheromone(self, offset_angle, sense_dist = 150):
        angle = math.atan2(self.velocity.y, self.velocity.x) + offset_angle
        sample_x = self.position.x + math.cos(angle) * sense_dist
        sample_y = self.position.y + math.sin(angle) * sense_dist
        gx = int(sample_x / grid_cell_size)
        gy = int(sample_y / grid_cell_size)
        if 0 <= gx < grid_w and 0 <= gy < grid_l:
                if not self.has_food:
                    return pheromone_grid_2[(gx,gy)]
                else:
                    return pheromone_grid[(gx,gy)]
        return 0.0

    def drop_pheromone(self):
        gx = int(self.position[0] / grid_cell_size)
        gy = int(self.position[1] / grid_cell_size)
        if 0 <= gx < grid_w and 0 <= gy < grid_l:
            if not self.has_food:
                # strength based on distance to nest (home trail)
                dist = self.position.distance_to(nest_position)
                strength = max(0.1, 1.0 - 2* dist / max_dist) * 2.0
                pheromone_grid[(gx,gy)] = min(pheromone_grid[(gx,gy)]+ strength, 1.0)
            else:
                # strength based on distance to food source (food trail)
                dist = self.position.distance_to(food_grid_position)
                strength = max(0.1, 1.0 - 2 * dist / max_dist) * 2
                pheromone_grid_2[(gx,gy)] = min(pheromone_grid_2[(gx,gy)]+ strength, 1.0)

    def collision_handling(self):
        if self.position[0] < 0 or self.position[0] > window_dimensions[0] or self.position[1] < 0 or self.position[1] > window_dimensions[1]:
            self.position[0] = max(0, min(window_dimensions[0], self.position[0]))
            self.position[1] = max(0, min(window_dimensions[1], self.position[1]))

            if self.position[0] <= 0 or self.position[0] >= window_dimensions[0]:
                normal = Vector2(1,0)

            elif self.position[1] <= 1 or self.position[1] >= window_dimensions[1]:
                normal = Vector2(0,1)
            
            else:
                normal = None
            
            if normal:
                self.desired_direction -=  2*(self.desired_direction.dot(normal)) * normal
                self.velocity -= 2*(self.velocity.dot(normal)) * normal
    
    def response_to_food(self):
        food_collection = get_food_collection(self.position)
        gx = int(self.position.x / grid_cell_size)
        gy = int(self.position.y / grid_cell_size)

        for bucket in food_collection:
            if (gx , gy ) in bucket:
                self.has_food = True
                self.food_target = None
                bucket.discard((gx, gy))
                if self.velocity.length() > 0:
                    self.velocity = -self.velocity
                    self.desired_direction = -self.desired_direction

    def detect_food(self):
        if self.has_food:
            return  # already carrying food, skip detection
        
        # current heading angle
        heading = math.atan2(self.velocity.y, self.velocity.x)
        closest_dist = float('inf')
        closest_food = None

        food_collection = get_food_collection(self.position)
        for bucket in food_collection:
            for food in bucket:

                fx = food[0] * grid_cell_size 
                fy = food[1] * grid_cell_size 

                dx = fx - self.position.x
                dy = fy - self.position.y
                dist = math.sqrt(dx*dx + dy*dy)

                if dist > self.fov_radius or dist > closest_dist:
                    continue 


                angle_to_food = math.atan2(dy, dx)

                angle_diff = (angle_to_food - heading + math.pi) % (2 * math.pi) - math.pi

                if abs(angle_diff) <= self.fov_angle / 2:
                    # food is within the cone
                    closest_dist = dist
                    closest_food = Vector2(fx, fy)

        self.food_target = closest_food


    def move_wander(self):
        self.detect_food()
        self.response_to_food()
        if self.food_target is not None:
            # steer directly toward detected food
            self.desired_direction = (self.food_target - self.position).normalize()

        else:
            self.desired_direction = (self.desired_direction + Vector2(random.uniform(-0.5,0.5), random.uniform(-0.5,0.5))* self.wander_strength).normalize()
            left = self.sample_pheromone(-0.5)
            center = self.sample_pheromone(0)
            right = self.sample_pheromone(0.5)

            if left > right and left > center:
                turn = -0.5 # turn left
            elif right > left and right > center:
                turn = 0.5 # turn right
            else:
                turn = 0.0

            if turn != 0:
                current_angle = math.atan2(self.velocity.y, self.velocity.x)
                nudge = Vector2(math.cos(current_angle + turn), math.sin(current_angle + turn))
                self.desired_direction = (self.desired_direction + nudge * follow_strength).normalize()
            
        desired_velocity = self.desired_direction * self.max_speed
        desired_steering_force = (desired_velocity - self.velocity) * self.steer_strength
        if desired_steering_force.length() > 0:
            self.acceleration = Vector2.clamp_magnitude(desired_steering_force, self.steer_strength)
        else:
            angle = random.uniform(0, 2 * math.pi)
            self.acceleration = Vector2(math.cos(angle), math.sin(angle))

        if (self.velocity + self.acceleration* dt).length() > 0:
            self.velocity = Vector2.clamp_magnitude(self.velocity + self.acceleration* dt, self.max_speed)
        else:
            angle = random.uniform(0, 2 * math.pi)
            self.acceleration = Vector2(math.cos(angle), math.sin(angle))
        self.position += self.velocity * dt

        self.collision_handling()
    
    def move_toward(self, target):
        # avoiding = self.wall_follow()
        if self.position.distance_to(target) < 20:
            self.has_food = False
            self.velocity = -self.velocity * 0.1
            self.desired_direction = -self.desired_direction
            self.acceleration = 0

        in_range = False
        dist = (target - self.position).length() 
        if dist == 0:
            in_range = True
        elif dist <= self.fov_radius + nest_radius:
            if self.velocity.length() > 0:
                view_dir = self.velocity.normalize()
                dir = (target - self.position).normalize()
                dot = view_dir.dot(dir)
                beta = math.asin(min(nest_radius / dist, 1))
                threshold = math.cos((self.fov_angle / 2) + beta)
                in_range = dot > threshold
            else:
                in_range = True 

        if not in_range:
            self.desired_direction = (self.desired_direction + Vector2(random.uniform(-0.5,0.5), random.uniform(-0.5,0.5))* self.wander_strength).normalize()
            left = self.sample_pheromone(-0.5)
            center = self.sample_pheromone(0)
            right = self.sample_pheromone(0.5)

            if left > right and left > center:
                turn = -0.5 # turn left
            elif right > left and right > center:
                turn = 0.5   # turn right
            else:
                turn = 0.0

            if turn != 0:
                current_angle = math.atan2(self.velocity.y, self.velocity.x)
                nudge = Vector2(math.cos(current_angle + turn), math.sin(current_angle + turn))
                self.desired_direction = (self.desired_direction + nudge * follow_strength).normalize()

        else:
            self.desired_direction = (target - self.position).normalize()

        desired_velocity = self.desired_direction * self.max_speed
        desired_steering_force = (desired_velocity - self.velocity) * self.steer_strength

        if desired_steering_force.length() > 0:
            self.acceleration = Vector2.clamp_magnitude(desired_steering_force, self.steer_strength)
        else:
            angle = random.uniform(0, 2 * math.pi)
            self.acceleration = Vector2(math.cos(angle), math.sin(angle))
            
        if (self.velocity + self.acceleration* dt).length() > 0:
            self.velocity = Vector2.clamp_magnitude(self.velocity + self.acceleration* dt, self.max_speed)
        else:
            angle = random.uniform(0, 2 * math.pi)
            self.acceleration = Vector2(math.cos(angle), math.sin(angle))
        
        self.position += self.velocity * dt
        
        self.collision_handling()

    def move(self):
        if not self.has_food:
            self.move_wander()
        else:
            self.move_toward(nest_position)

    def draw(self): 
        color = (0, 255, 0) if self.has_food else (255, 255, 255)
        pygame.draw.circle(window, color, self.position, 2)

ants = []
for x in range(100,120, 2):
    for y in range (100,120, 3):
        ants.append(Ant(Vector2(x,y)))
add_rect_obstacle(0,0,window_dimensions[0],5)
add_rect_obstacle(0,window_dimensions[1] - 5,window_dimensions[0],5)
add_rect_obstacle(0,0,5,window_dimensions[1])
add_rect_obstacle(window_dimensions[1] - 5,0,5,window_dimensions[1])
running = True

while running:
    window.fill((0,0,0))
    for event in pygame.event.get():
        if event.type == pygame.QUIT:
            running = False
        elif event.type == pygame.KEYDOWN:
            if event.key == pygame.K_f:
                speedup += 1
                dt = speedup/fps
            elif event.key == pygame.K_r:
                speedup -= 1
                speedup = max(1,speedup)
                dt = speedup/fps
    
    for ant in ants:
        ant.move()

    if timer1 >= pheromone_time_interval:
        timer1 -= pheromone_time_interval
        for ant in ants:
            ant.drop_pheromone()
    if timer2 >= evaporation_time_interval:
        timer2 -= evaporation_time_interval
        evaporate_grid()

    draw_pheromones()
    draw_food_grid()
    draw_nest()
    for ant in ants:
        ant.draw()

    pygame.display.update()

    timer1 += dt
    timer2 += dt
    clock.tick(fps)




        
    
