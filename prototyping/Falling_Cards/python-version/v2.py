import pygame as pg
from math import sqrt
ww, wh = 1000, 1000 
clock = pg.time.Clock()

fps = 60
dt = 1/fps 


class Camera:
    def __init__(self):
        self.pos = [0,0,-1]
        self.cmatrix = [
            [1, 0, 0],
            [0, 1, 0],
            [0, 0, 1]
        ]

class Mesh:
    def __init__(self):
        self.rmatrix = [] # matrix of length restrictions
        self.positions=[]
        self.velocities=[]
    
    def update(self, dt):
        for i in range(len(self.positions)):
            self.velocities[i][1] += 10*dt
            for j in range(3):
                self.positions[i][j] += self.velocities[i][j] * dt 

    def project(self, cpos, cmatrix):
        # cmatrix in form, right, up, front
        projecteds = []
        for point in self.positions:
            np = [point[i] - cpos[i] for i in range(3)]
            pp = [sum([np[j] * cmatrix[i][j] for j in range(3)]) for i in range(3)]
            projected = [pp[i] / (pp[2]+1) for i in range(2)]
            projecteds.append(projected)

        return projecteds
    
    @staticmethod
    def getcard():
        out = Mesh()
        positions = [[-1,0,0], [-1,1,0] [1,1,0], [1,-1,0]]
        velocities = [[0,0,0] for _ in range(4)]
        rmatrix = [[0,1,sqrt(2),1], [1, 0, 1, sqrt(2)], [sqrt(2), 1, 0, 1], [1, sqrt(2), 1, 0]] # 00, 01, 02, 03, 10, 11, 12,13...
        out.positions = positions
        out.velocities = velocities
        out.rmatrix = rmatrix
        return out
    
def main():
    window = pg.display.set_mode((ww,wh))

    cam = Camera()
    cards = [Mesh.getcard()]

    running = True
    while running:
        for event in pg.event.get():
            if event.type == pg.QUIT:
                running = False 

        for card in cards:
            card.update(dt)
            pps = [[(point[i] + 0.5) * ww for i in range(2)] for point in card.project(cam.pos, cam.cmatrix)]
    
        window.fill((0,0,0))

        pg.display.flip()
        clock.tick(fps)
