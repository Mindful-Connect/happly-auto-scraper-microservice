import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Observable } from 'rxjs';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class AuthTokenGuard implements CanActivate {
  constructor(private configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean | Promise<boolean> | Observable<boolean> {
    const request = context.switchToHttp().getRequest();

    const bearerToken = request.headers.authorization;
    if (!bearerToken) {
      return false;
    }

    const token = bearerToken.split(' ')[1];
    return !(!token && token !== this.configService.get<string>('API_SECRET_KEY'));
  }
}
