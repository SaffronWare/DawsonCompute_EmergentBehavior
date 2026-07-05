import pygame
from math import cos, sin
from pygame import Vector3, Vector2


def rotate2D(point, angle):
    c = cos(angle)
    s = sin(angle)
    return Vector2(c*point.x - s*point.y, s*point.x +c*point.y)
def rotate_x(point, angle):
    p = Vector2(point.y, point.z)
    rp = rotate2D(p, angle)
    return Vector3(point.x, rp.x, rp.y)

def rotate_y(point, angle):
    p = Vector2(point.x, point.z)
    rp = rotate2D(p, angle)
    return Vector3(rp.x, point.y, rp.y)

def rotate_z(point, angle):
    p = Vector2(point.x, point.y)
    rp = rotate2D(p, angle)
    return Vector3(rp.x, rp.y, point.z)


def transform(point, ori):
    return rotate_z(rotate_y(rotate_x(point, ori.x), ori.y), ori.z)


class Camera:
    def __init__(self):
        self.pos = Vector3()
        self.ori = Vector3()
        self.box = [Vector3(1,0,0), Vector3(0,1,0), Vector3(0,0,1)]
    
    def upd_box(self):
        self.box = [Vector3(1,0,0), Vector3(0,1,0), Vector3(0,0,1)]
        self.box = [transform(direction, self.ori) for direction in self.box ]
    
    def project(self, point : Vector3):
        xrel, yrel, zrel = [(point-self.pos) * direc for direc in self.box]
        iff = zrel > 0
        return Vector2(xrel,yrel)/abs(zrel), iff

## We can approximate depth = 0?
class Card:
    def __init__(self, size, position, orientation):
        self.dims = size 
        self.pos = position
        self.ori = orientation
        self.vel = Vector3()
        self.avel = Vector3()

    def update(self,dt):
        self.pos += self.vel * dt 
        self.ori += self.avel * dt

    def display(self, window, camera):
        tr = self.dims / 2
        bl = -self.dims /2 
        tl = Vector3(-self.dims.x, self.dims.y,0)/2
        br = Vector3(self.dims.x, -self.dims.y,0)/2
        points=[off for off in [tr,tl,bl,br]]
        print(points)
        points=[transform(p,self.ori) + self.pos for p in points]
        points=[camera.project(p)[0] for p in points]
        points = [(p)*500/2 + Vector2(250,250) for p in points]
        pygame.draw.polygon(window, (200,200,200), points)


def main():
    pygame.init()
    clock = pygame.time.Clock()

    window_size = 500
    fps = 60
    dt = 1/fps

    window = pygame.display.set_mode((window_size, window_size))

    card1 = Card(Vector3(1,1,0), Vector3(0,0,0), Vector3())
    camera = Camera()
    camera.pos = Vector3(0,0,-2)
    

    running = True 
    while running:
        window.fill((0,0,0))
        
        card1.display(window, camera)
        card1.ori.y += 10*dt
        #camera.pos.z = dt

        for event in pygame.event.get():
            if event.type == pygame.QUIT:
                running = False 
    
        pygame.display.flip()
        clock.tick(fps)
    
    pygame.quit()


if __name__ == '__main__':
    main()

