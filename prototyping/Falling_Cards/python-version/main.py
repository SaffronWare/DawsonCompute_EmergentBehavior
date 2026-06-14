import pygame
from pygame import Vector3 


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
