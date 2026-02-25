import {
  Injectable,
  UnauthorizedException,
  ConflictException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { JwtService } from '@nestjs/jwt';
import { Model } from 'mongoose';
import * as bcrypt from 'bcrypt';
import { User, UserDocument } from './schemas/user.schema';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class AuthService {
  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    private jwtService: JwtService,
  ) {}

  async register(dto: RegisterDto): Promise<any> {
    const existingUser = await this.userModel.findOne({ email: dto.email.toLowerCase() });
    if (existingUser) {
      throw new ConflictException('Email already registered');
    }

    const passwordHash = await bcrypt.hash(dto.password, 12);
    const user = await this.userModel.create({
      email: dto.email.toLowerCase(),
      passwordHash,
    });

    const payload = { sub: user._id, email: user.email };
    const accessToken = this.jwtService.sign(payload);

    return {
      message: 'User registered successfully',
      accessToken,
      user: {
        id: user._id,
        email: user.email,
      },
    };
  }

  async login(dto: LoginDto): Promise<any> {
    const user = await this.userModel.findOne({ email: dto.email.toLowerCase() });
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const isPasswordValid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const payload = { sub: user._id, email: user.email };
    const accessToken = this.jwtService.sign(payload);

    return {
      message: 'User logged in successfully',
      accessToken,
      user: {
        id: user._id,
        email: user.email,
      },
    };
  }

  async validateUser(userId: string): Promise<UserDocument | null> {
    return this.userModel.findById(userId).select('-passwordHash');
  }
}
